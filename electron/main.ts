import { app, BrowserWindow, ipcMain, protocol, net, Menu, dialog } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import * as db from './db';
import { nefExtractor } from './nefExtractor';
import { ExifTool } from 'exiftool-vendored';
import { ApiService } from './apiService';
import { ExportImageContext } from './types';
import { SessionLogManager } from './sessionLogManager';
import { deepMergeConfig, getConfigPath, loadAppConfig, normalizeAppConfig } from './config';
import { resolveBackendUiStaticDir, startScoringUiServer, type ScoringUiServer } from './scoringUiServer';

const exiftool = new ExifTool({ maxProcs: 2 });

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// if (require('electron-squirrel-startup')) {
//     app.quit();
// }

let mainWindow: BrowserWindow | null = null;
/** Set when launched with --webui-shell=URL (backend WebUI in a dedicated window). */
let webuiShellWindow: BrowserWindow | null = null;
let currentExportImageContext: ExportImageContext | null = null;
let sessionLogManager: SessionLogManager | null = null;

/**
 * Thumbnails may not exist at the exact path from the DB:
 * - Repo renamed to image-scoring-backend while JPEGs still live under .../image-scoring/thumbnails
 * - DB stores flat thumbnails/<hash>.jpg but on-disk layout is nested thumbnails/<aa>/<hash>.jpg
 */
function resolveMediaFilePathWithFallbacks(normalizedPath: string): string {
    if (fs.existsSync(normalizedPath)) {
        return normalizedPath;
    }

    const tryLegacyRepo = (p: string): string | null => {
        if (/image-scoring-backend/i.test(p)) {
            const alt = p.replace(/image-scoring-backend/gi, 'image-scoring');
            if (alt !== p && fs.existsSync(alt)) {
                return alt;
            }
        }
        return null;
    };

    const legacy = tryLegacyRepo(normalizedPath);
    if (legacy) {
        return legacy;
    }

    const dir = path.dirname(normalizedPath);
    const base = path.basename(normalizedPath);
    const flat = /^([a-f0-9]{32})\.(jpe?g|png)$/i.exec(base);
    if (flat && path.basename(dir).toLowerCase() === 'thumbnails') {
        const hash = flat[1];
        const nested = path.join(dir, hash.slice(0, 2), base);
        if (fs.existsSync(nested)) {
            return nested;
        }
        const nestedLegacy = tryLegacyRepo(nested);
        if (nestedLegacy) {
            return nestedLegacy;
        }
    }

    return normalizedPath;
}

/**
 * Windows .ico from Python backend `static/favicon.ico` (sibling repo) for embedded WebUI windows.
 */
function resolveBackendWebuiWindowIcon(): string | undefined {
    const candidates = [
        path.join(__dirname, '..', 'image-scoring-backend', 'static', 'favicon.ico'),
        path.join(__dirname, '..', 'image-scoring', 'static', 'favicon.ico'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                return p;
            }
        } catch {
            /* ignore */
        }
    }
    return undefined;
}

/**
 * Map a media:// request URL to a filesystem path.
 * Chromium parses `media://D:/path` as host "D" + pathname "/path", which drops the colon;
 * recover that on Windows. Correct `media:///D:/path` yields pathname "/D:/path".
 */
function parseMediaUrlToFilePath(requestUrl: string): string {
    const u = new URL(requestUrl);
    let pathname = u.pathname;
    try {
        pathname = decodeURIComponent(pathname);
    } catch {
        throw new Error('invalid encoding');
    }

    if (process.platform === 'win32' && /^[a-zA-Z]$/.test(u.hostname) && pathname.length > 1) {
        return `${u.hostname.toUpperCase()}:${pathname}`;
    }

    let filePath = pathname;
    if (filePath.match(/^\/?mnt\/[a-zA-Z]\//)) {
        filePath = filePath.replace(/^\/?mnt\/([a-zA-Z])\//, '$1:/');
    }
    if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(filePath)) {
        filePath = filePath.slice(1);
    }
    return filePath;
}

function getDialogWindow(): BrowserWindow | null {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && !focused.isDestroyed()) return focused;
    return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
}

function showMessageBox(options: Electron.MessageBoxOptions) {
    const win = getDialogWindow();
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function showSaveDialog(options: Electron.SaveDialogOptions) {
    const win = getDialogWindow();
    return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
}

/**
 * Wraps an IPC handler to provide consistent error handling.
 * Returns { ok: true, data: T } on success, { ok: false, error: string } on error.
 */
function wrapIpcHandler<T>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (...args: any[]) => Promise<T> | T
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (...args: any[]) => Promise<{ ok: boolean; data?: T; error?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (...args: any[]) => {
        try {
            const data = await handler(...args);
            return { ok: true, data };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error) || 'Unknown error';
            console.error('[IPC] Handler error:', errorMessage, error);
            return { ok: false, error: errorMessage };
        }
    };
}

const exportCurrentImage = async () => {
    if (!currentExportImageContext?.imageBytes?.length) {
        mainWindow?.webContents.send('show-notification', {
            message: 'No image preview is currently available to export.',
            type: 'warning'
        });
        return;
    }

    const defaultName = currentExportImageContext.fileName || 'export.jpg';
    const saveResult = await showSaveDialog({
        title: 'Export',
        defaultPath: defaultName,
    });

    if (saveResult.canceled || !saveResult.filePath) {
        return;
    }

    const targetPath = saveResult.filePath;
    await fs.promises.writeFile(targetPath, Buffer.from(currentExportImageContext.imageBytes));

    // Enrich with metadata
    try {
        const sourcePath = currentExportImageContext.sourcePath;
        const metadata = [
            `Original Path: ${sourcePath}`,
            `Original Name: ${path.basename(sourcePath)}`,
            `Image UUID: ${currentExportImageContext.imageUuid || 'None'}`,
            `Export Date: ${new Date().toLocaleString()}`,
            `Database ID: ${currentExportImageContext.id}`
        ].join('\n');

        // 1. Copy tags from source if it exists
        if (fs.existsSync(sourcePath)) {
            console.log(`[Main] Copying EXIF from ${sourcePath} to ${targetPath}`);
            // Use command line exiftool for bulk tag copying as it's often more reliable for "TagsFromFile"
            // but exiftool-vendored can also do it. Let's use the library's write method if possible, 
            // but copying ALL tags is tricky with just .write().
            // Actually, exiftool-vendored is a wrapper.
            // Let's try to copy common tags or use the command line if needed.
            // The library doesn't easily support TagsFromFile in a high-level way.

            // Fallback to manual copy of important tags if TagsFromFile is not available in the library easily.
            // Wait, I can use exiftool.execute? 
            // The exiftool-vendored README says to use .write with a source file? No.

            // I'll use the library to read source and write to target.
            const sourceTags = await exiftool.read(sourcePath);
            const tagsToCopy: Record<string, unknown> = {};

            // Define list of tags to preserve (standard photography tags)
            const preserveTags = [
                'Make', 'Model', 'LensModel', 'ISO', 'ExposureTime', 'FNumber',
                'FocalLength', 'DateTimeOriginal', 'CreateDate', 'GPSLatitude',
                'GPSLongitude', 'GPSAltitude', 'Orientation'
            ];

            for (const tag of preserveTags) {
                if (sourceTags[tag as keyof typeof sourceTags] !== undefined) {
                    tagsToCopy[tag] = sourceTags[tag as keyof typeof sourceTags];
                }
            }

            // Add our custom description
            tagsToCopy.ImageDescription = metadata;
            tagsToCopy.Description = metadata; // XMP
            tagsToCopy.XPComment = metadata;    // Windows
            tagsToCopy.UserComment = metadata;

            console.log(`[Main] Writing enriched metadata to ${targetPath}`);
            await exiftool.write(targetPath, tagsToCopy, ['-overwrite_original']);
        } else {
            // Just write our metadata if source is missing
            await exiftool.write(targetPath, {
                ImageDescription: metadata,
                Description: metadata,
                XPComment: metadata,
                UserComment: metadata
            }, ['-overwrite_original']);
        }
    } catch (exifErr) {
        console.error('[Main] Metadata enrichment failed:', exifErr);
        // We still exported the image, so we don't treat this as a fatal error for the user,
        // but it's worth logging.
    }

    mainWindow?.webContents.send('show-notification', {
        message: `Image exported to:\n${targetPath}`,
        type: 'success'
    });
};

const rebuildApplicationMenu = () => {
    const menu = Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [
                {
                    label: 'Settings',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-settings');
                        }
                    }
                },
                {
                    label: 'Import',
                    click: async () => {
                        const win = getDialogWindow();
                        const result = await dialog.showOpenDialog(win || mainWindow!, {
                            properties: ['openDirectory'],
                            title: 'Select folder to import'
                        });
                        if (!result.canceled && result.filePaths[0]) {
                            mainWindow?.webContents.send('import:folder-selected', result.filePaths[0]);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Export',
                    enabled: !!currentExportImageContext?.imageBytes?.length,
                    click: async () => {
                        try {
                            await exportCurrentImage();
                        } catch (e: unknown) {
                            console.error('[Main] Export image error:', e);
                            await showMessageBox({
                                type: 'error',
                                title: 'Export Failed',
                                message: e instanceof Error ? e.message : 'Failed to export image.',
                            });
                        }
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Tools',
            submenu: [
                {
                    label: 'Diagnostics',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-diagnostics');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Scoring...',
                    click: () => {
                        openScoringWindow();
                    }
                }
            ]
        },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },

    ]);

    Menu.setApplicationMenu(menu);
};

// Register secure media protocol
protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, standard: true, bypassCSP: true } }
]);

// Load configuration
function loadConfig() {
    const configPath = getConfigPath(__dirname);
    return loadAppConfig(configPath);
}

const config = loadConfig();
const apiService = new ApiService(loadConfig);

function parseWebuiShellUrl(): string | null {
    const prefix = '--webui-shell=';
    for (const a of process.argv) {
        if (a.startsWith(prefix)) {
            const u = a.slice(prefix.length).trim();
            return u.length > 0 ? u : null;
        }
    }
    return null;
}

const webuiShellOnlyUrl = parseWebuiShellUrl();

/**
 * Searches for active backend WebUI instances by reading .lock files 
 * in sibling repo directories.
 */
async function findActiveWebuiPort(): Promise<number | null> {
    try {
        const projectRoot = path.resolve(__dirname, '..');
        const projectsDir = path.resolve(projectRoot, '..');
        const lockFiles = [
            path.join(projectsDir, 'image-scoring-backend', 'webui.lock'),
            path.join(projectsDir, 'image-scoring-backend', 'webui-debug.lock'),
            path.join(projectsDir, 'image-scoring', 'webui.lock'),
            path.join(projectsDir, 'image-scoring', 'webui-debug.lock'),
        ];

        for (const lockFile of lockFiles) {
            if (fs.existsSync(lockFile)) {
                const content = await fs.promises.readFile(lockFile, 'utf8');
                const data = JSON.parse(content);
                if (data && data.port) {
                    console.log(`[Main] Found active WebUI at port ${data.port} from ${path.basename(lockFile)}`);
                    return data.port;
                }
            }
        }
    } catch (e) {
        console.error('[Main] Failed to read API lock files:', e);
    }
    return null;
}

/** Serves backend SPA from disk; proxies API/WS to FastAPI (see scoringUiServer.ts). */
let scoringUiServer: ScoringUiServer | null = null;
let scoringUiReady: Promise<ScoringUiServer | null> | null = null;

async function ensureScoringUiServer(): Promise<ScoringUiServer | null> {
    if (scoringUiServer) {
        return scoringUiServer;
    }
    const staticRoot = resolveBackendUiStaticDir(__dirname);
    if (!staticRoot) {
        return null;
    }
    if (!scoringUiReady) {
        scoringUiReady = startScoringUiServer(() => apiService.getBaseUrl(), staticRoot)
            .then((s) => {
                scoringUiServer = s;
                return s;
            })
            .catch((err) => {
                console.error('[Main] Scoring UI server failed:', err);
                return null;
            })
            .finally(() => {
                scoringUiReady = null;
            });
    }
    return scoringUiReady;
}

function openScoringWindow(): void {
    void (async () => {
        const backendIcon = resolveBackendWebuiWindowIcon();
        const win = new BrowserWindow({
            width: 1280,
            height: 900,
            title: 'Image Scoring',
            ...(backendIcon ? { icon: backendIcon } : {}),
            webPreferences: { contextIsolation: true },
        });
        win.setMenu(null);
        try {
            const local = await ensureScoringUiServer();
            const url = local ? `${local.baseUrl}/ui/runs` : `${apiService.getBaseUrl()}/ui/runs`;
            await win.loadURL(url);
        } catch (e) {
            console.error('[Main] Failed to load Scoring UI:', e);
            try {
                await win.loadURL(`${apiService.getBaseUrl()}/ui/runs`);
            } catch {
                /* ignore */
            }
        }
    })();
}

app.on('before-quit', () => {
    if (scoringUiServer) {
        void scoringUiServer.close();
        scoringUiServer = null;
    }
});

const devRemoteDebuggingPort = process.env.ELECTRON_REMOTE_DEBUGGING_PORT || '9222';

if (isDev) {
    app.commandLine.appendSwitch('remote-debugging-port', devRemoteDebuggingPort);
}

function createWindow() {
    console.log('[Main] Creating window...');
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
        },
        icon: path.join(__dirname, '../public/icon.png')
    });

    if (isDev) {
        const devUrl = config.dev?.url || 'http://localhost:5173';
        console.log('[Main] Loading dev URL:', devUrl);
        mainWindow.loadURL(devUrl);
    } else {
        console.log('[Main] Loading production file');
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        console.log('[Main] Window closed');
        mainWindow = null;
    });

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Main] Window finished loading');
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('[Main] Window failed to load:', errorCode, errorDescription);
    });
}

function createWebuiShellWindow(targetUrl: string): void {
    console.log('[Main] Standalone WebUI shell, loading:', targetUrl);
    const backendIcon = resolveBackendWebuiWindowIcon();
    webuiShellWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Image Scoring WebUI',
        ...(backendIcon ? { icon: backendIcon } : {}),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    webuiShellWindow.loadURL(targetUrl);
    webuiShellWindow.on('closed', () => {
        webuiShellWindow = null;
        app.quit();
    });
}

async function startFullApplication(): Promise<void> {
    console.log('[Main] App ready, setting up protocol...');

    // Provider-aware DB init:
    // - Firebird: ensure server is up (and auto-start when configured)
    // - Postgres: lightweight connectivity check only
    await db.initializeDatabaseProvider();

    // Handle media:// requests with path sanitization
    protocol.handle('media', (request) => {
        console.log('[Main] Media request:', request.url);
        try {
            let filePath = request.url.replace(/^media:\/\/(local\/)?/i, '');
            try {
                filePath = decodeURIComponent(filePath);
            } catch {
                return new Response('Invalid encoding', { status: 400 });
            }

            // Reconstruct missing colon for Windows drive letters (e.g. from media://d/Projects...)
            if (process.platform === 'win32' && /^[a-zA-Z]\//.test(filePath) && !filePath.includes(':')) {
                const reconstructed = filePath[0] + ':' + filePath.slice(1);
                if (path.isAbsolute(reconstructed)) {
                    filePath = reconstructed;
                }
            }

            // Convert WSL paths to Windows paths
            if (filePath.match(/^\/?mnt\/[a-zA-Z]\//)) {
                filePath = filePath.replace(/^\/?mnt\/([a-zA-Z])\//, '$1:/');
            }

            // media:///D:/... → /D:/... after strip — normalize to D:/...
            if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(filePath)) {
                filePath = filePath.slice(1);
            }

            // Check before path.resolve: resolve() always yields an absolute path, so the old
            // check on normalizedPath could not block relative paths like d/Projects/... (bad URL parse).
            if (!path.isAbsolute(filePath)) {
                console.error('[Main] Blocked non-absolute path:', filePath);
                return new Response('Access denied', { status: 403 });
            }

            const resolvedPath = path.resolve(filePath);
            const normalizedPath = path.normalize(resolvedPath);

            const mediaPath = resolveMediaFilePathWithFallbacks(normalizedPath);
            if (mediaPath !== normalizedPath && fs.existsSync(mediaPath)) {
                console.log('[Main] Media path fallback:', normalizedPath, '->', mediaPath);
            }

            const fileUrl = pathToFileURL(mediaPath).href;
            return net.fetch(fileUrl);
        } catch (e) {
            console.error('[Main] Invalid media path:', request.url, e);
            return new Response('Invalid path', { status: 400 });
        }
    });

    // Register ALL IPC handlers BEFORE creating the window.
    // The renderer calls ping/checkDbConnection immediately on load —
    // if handlers aren't registered yet, ipcRenderer.invoke() never resolves.
    ipcMain.handle('ping', () => 'pong');

    ipcMain.handle('db:check-connection', wrapIpcHandler(async () => {
        return await db.checkConnection();
    }));

    ipcMain.handle('db:get-image-count', wrapIpcHandler(async (_, options) => {
        return await db.getImageCount(options);
    }));

    ipcMain.handle('db:get-images', wrapIpcHandler(async (_, options) => {
        return await db.getImages(options);
    }));

    ipcMain.handle('db:get-image-details', wrapIpcHandler(async (_, id) => {
        console.log(`[Main] Getting image details for ID: ${id}`);
        const result = await db.getImageDetails(id);
        console.log(`[Main] Image details result:`, result ? 'Data received' : 'NULL returned');
        if (result) {
            console.log(`[Main] Image details keys:`, Object.keys(result));
        }
        return result;
    }));

    ipcMain.handle('db:update-image-details', wrapIpcHandler(async (_, { id, updates }) => {
        console.log(`[Main] Updating image details for ID: ${id}`, updates);
        return await db.updateImageDetails(id, updates);
    }));

    ipcMain.handle('db:delete-image', wrapIpcHandler(async (_, id) => {
        console.log(`[Main] Deleting image ID: ${id}`);
        return await db.deleteImage(id);
    }));

    ipcMain.handle('db:get-keywords', wrapIpcHandler(async () => {
        return await db.getKeywords();
    }));

    ipcMain.handle('mcp-find-duplicates', wrapIpcHandler(async (_, options) => {
        console.log(`[Main] Finding near duplicates via backend API`, options);
        return await apiService.findDuplicates(options);
    }));

    ipcMain.handle('mcp:search-similar', wrapIpcHandler(async (_, options) => {
        console.log(`[Main] Finding similar images via backend API`, options);
        const { imageId, limit, folderId, folderPath, minSimilarity } = options;
        if (!imageId) throw new Error("image_id is required");

        const resolvedFolderPath = folderPath || (folderId ? await db.getFolderPathById(folderId) : undefined) || undefined;

        return await apiService.searchSimilar({
            image_id: imageId,
            limit,
            folder_path: resolvedFolderPath,
            min_similarity: minSimilarity,
        });
    }));

    ipcMain.handle('api:outliers', wrapIpcHandler(async (_, options) => {
        console.log(`[Main] Finding outliers via backend API`, options);
        const { folderPath, zThreshold, k, limit } = options;
        if (!folderPath) throw new Error("folder_path is required");
        return await apiService.getOutliers({
            folder_path: folderPath,
            z_threshold: zThreshold,
            k,
            limit,
        });
    }));

    ipcMain.handle('db:get-stacks', wrapIpcHandler(async (_, options) => {
        return await db.getStacks(options);
    }));

    ipcMain.handle('db:get-images-by-stack', wrapIpcHandler(async (_, { stackId, options }) => {
        return await db.getImagesByStack(stackId, options);
    }));

    ipcMain.handle('db:get-stack-count', wrapIpcHandler(async (_, options) => {
        return await db.getStackCount(options);
    }));

    ipcMain.handle('db:rebuild-stack-cache', wrapIpcHandler(async () => {
        const count = await db.rebuildStackCache();
        return { success: true, count };
    }));

    ipcMain.handle('db:get-folders', wrapIpcHandler(async () => {
        const rawFolders = await db.getFolders() as { path: string;[key: string]: unknown }[];


        const convertPathToLocal = (p: string) => {
            const isWindows = process.platform === 'win32';
            if (isWindows) {
                const pStr = p.replace(/\\/g, '/');
                if (pStr.startsWith('/mnt/')) {
                    const parts = pStr.split('/');
                    if (parts.length > 2 && parts[2].length === 1) {
                        const drive = parts[2].toUpperCase();
                        const rest = parts.slice(3).join('/');
                        return `${drive}:/${rest}`;
                    }
                }
            }
            return p;
        };

        const processed = rawFolders.map((f: { path: string;[key: string]: unknown }) => {
            return { ...f, path: convertPathToLocal(f.path) };
        }).filter((f: { path: string }) => {
            if (process.platform === 'win32') {
                const isDrivePath = /^[a-zA-Z]:/.test(f.path);
                if (!isDrivePath) return false;
                if (f.path.startsWith('/mnt') || f.path === '/' || f.path === '.') return false;
                return true;
            }
            return true;
        });

        const existsAsDir = async (dirPath: string): Promise<boolean> => {
            try {
                const st = await fs.promises.stat(dirPath);
                return st.isDirectory();
            } catch {
                return false;
            }
        };

        const flags = await Promise.all(processed.map((f: { path: string }) => existsAsDir(f.path)));
        return processed.filter((_: unknown, i: number) => flags[i]);
    }));

    ipcMain.handle('db:delete-folder', wrapIpcHandler(async (_, id) => {
        console.log(`[Main] Deleting folder ID: ${id}`);
        return await db.deleteFolder(id);
    }));

    const IMAGE_EXTENSIONS = new Set([
        '.jpg', '.jpeg', '.png', '.nef', '.arw', '.cr2', '.dng', '.heic', '.webp', '.tiff', '.tif', '.raw', '.orf', '.rw2'
    ]);

    ipcMain.handle('import:run', wrapIpcHandler(async (_, folderPath: string) => {
        if (!folderPath || typeof folderPath !== 'string') {
            throw new Error('Folder path is required');
        }
        const stat = await fs.promises.stat(folderPath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${folderPath}`);
        }

        // Try API first (Gradio backend); fallback to direct Firebird DB
        const useApi = await apiService.isAvailable();
        if (useApi) {
            try {
                console.log('[Main] Import via API (Gradio backend)');
                // NOTE: API import processes the folder in a single request. Progress is sent once
                // at completion; no incremental updates during import. For large folders, the UI
                // may appear frozen until the request returns. Direct DB fallback sends per-file progress.
                const res = await apiService.importRegister({ folder_path: folderPath });
                const data = res?.data;
                const added = data?.added ?? 0;
                const skipped = data?.skipped ?? 0;
                const errs = data?.errors ?? [];
                const total = added + skipped + errs.length;
                if (total > 0) {
                    mainWindow?.webContents.send('import:progress', { current: total, total, path: '' });
                }
                return { added, skipped, errors: errs };
            } catch (e) {
                console.warn('[Main] Import via API failed, falling back to direct DB:', e);
            }
        } else {
            console.log('[Main] Gradio not available, using direct Firebird DB for import');
        }

        // Fallback: direct Firebird DB
        const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
        const files = entries
            .filter(e => e.isFile())
            .map(e => path.join(folderPath, e.name))
            .filter(p => IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase()));

        const total = files.length;
        let added = 0;
        let skipped = 0;
        const errors: string[] = [];

        const folderId = await db.getOrCreateFolder(folderPath);

        for (let i = 0; i < files.length; i++) {
            const filePath = files[i];
            const fileName = path.basename(filePath);
            const fileType = path.extname(filePath).toLowerCase().replace(/^\./, '') || 'unknown';

            mainWindow?.webContents.send('import:progress', { current: i + 1, total, path: filePath });

            try {
                const existsByPath = await db.findImageByFilePath(filePath);
                if (existsByPath) {
                    skipped++;
                    continue;
                }

                let imageUuid: string | null = null;
                try {
                    const tags = await exiftool.read(filePath);
                    const uid = tags.ImageUniqueID ?? tags.DocumentID ?? null;
                    if (uid && typeof uid === 'string') {
                        imageUuid = uid;
                        const existsByUuid = await db.findImageByUuid(imageUuid);
                        if (existsByUuid) {
                            skipped++;
                            continue;
                        }
                    }
                } catch {
                    // No EXIF or read failed; proceed without UUID
                }

                await db.insertImage({
                    file_path: filePath,
                    file_name: fileName,
                    file_type: fileType,
                    folder_id: folderId,
                    image_uuid: imageUuid
                });
                added++;
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                errors.push(`${fileName}: ${msg}`);
            }
        }

        return { added, skipped, errors };
    }));

    ipcMain.handle('nef:extract-preview', wrapIpcHandler(async (_, filePath: string) => {
        console.log(`[Main] NEF preview requested for: ${filePath}`);

        let convertedPath = filePath;
        if (process.platform === 'win32' && filePath.match(/^\/mnt\/[a-zA-Z]\//)) {
            convertedPath = filePath.replace(/^\/mnt\/([a-zA-Z])\//, '$1:/');
            console.log(`[Main] Converted WSL path: ${filePath} -> ${convertedPath}`);
        }

        const ext = path.extname(convertedPath).toLowerCase();
        if (ext !== '.nef') {
            console.log(`[Main] Skipping non-NEF file (${ext}), returning fallback`);
            const fileBuffer = await fs.promises.readFile(convertedPath);
            return {
                success: false,
                fallback: true,
                buffer: fileBuffer
            };
        }

        const buffer = await nefExtractor.extractPreview(convertedPath);

        if (buffer) {
            return {
                success: true,
                buffer: buffer
            };
        }

        console.log('[Main] Tier 1 failed, falling back to client-side extraction');
        const fileBuffer = await fs.promises.readFile(convertedPath);
        return {
            success: false,
            fallback: true,
            buffer: fileBuffer
        };
    }));

    ipcMain.handle('nef:read-exif', wrapIpcHandler(async (_, filePath: string) => {
        try {
            console.log(`[Main] EXIF read requested for: ${filePath}`);
            let convertedPath = filePath;
            if (process.platform === 'win32' && filePath.match(/^\/mnt\/[a-zA-Z]\//)) {
                convertedPath = filePath.replace(/^\/mnt\/([a-zA-Z])\//, '$1:/');
            }
            // Add a timeout inside the IPC handler so it doesn't freeze the UI 
            return await exiftool.read(convertedPath);
        } catch (e: unknown) {
            console.error('[Main] EXIF read error:', e);
            throw e;
        }
    }));

    ipcMain.handle('export:set-current-image-context', async (_, context: ExportImageContext | null) => {
        currentExportImageContext = context;
        rebuildApplicationMenu();
        return true;
    });

    ipcMain.handle('debug:log', async (_, { level, message, data, timestamp }) => {
        const logDir = app.getPath('userData');

        if (!sessionLogManager) {
            sessionLogManager = new SessionLogManager(logDir);
        }

        const logFile = await sessionLogManager.getWritableLogPath(new Date());

        const logEntry = JSON.stringify({
            timestamp,
            level,
            message,
            data
        }) + os.EOL;

        try {
            await fs.promises.appendFile(logFile, logEntry);
            return true;
        } catch (e) {
            console.error('Failed to write log:', e);
            return false;
        }
    });

    ipcMain.handle('system:get-api-config', async () => {
        const config = loadConfig();
        const apiPort = await findActiveWebuiPort();
        
        let port = apiPort || 7860;
        let host = '127.0.0.1';

        if (config.api) {
            if (config.api.url) return { url: config.api.url };
            if (config.api.port) port = config.api.port;
            if (config.api.host) host = config.api.host;
        }

        return { url: `http://${host}:${port}` };
    });

    ipcMain.handle('system:get-api-port', async () => {
        const config = loadConfig();
        if (config.api?.port) return config.api.port;
        if (config.api?.url) {
            const match = config.api.url.match(/:(\d+)(?:\/|$)/);
            if (match) return parseInt(match[1], 10);
        }
        return (await findActiveWebuiPort()) || 7860;
    });

    ipcMain.handle('system:get-config', wrapIpcHandler(async () => {
        return loadConfig();
    }));

    ipcMain.handle('system:get-diagnostics', wrapIpcHandler(async () => {
        const os = await import('os');
        const cfg = loadConfig();
        const dbCfg = (cfg as Record<string, unknown>).database as Record<string, unknown> | undefined;
        const apiUrl = apiService.getBaseUrl();
        let apiConnected = false;
        try {
            const r = await fetch(apiUrl + '/health');
            apiConnected = r.ok;
        } catch { /* backend unreachable */ }
        return {
            os: {
                platform: os.platform(),
                release: os.release(),
                arch: os.arch(),
                uptime: os.uptime(),
            },
            versions: {
                electron: process.versions.electron ?? '',
                node: process.versions.node ?? '',
                chrome: process.versions.chrome ?? '',
                v8: process.versions.v8 ?? '',
            },
            database: {
                engine: (dbCfg?.engine as string) ?? 'firebird',
                connected: await db.checkConnection().catch(() => false),
                host: (dbCfg?.host as string) ?? 'localhost',
                database: (dbCfg?.path as string) ?? '',
            },
            api: { url: apiUrl, connected: apiConnected },
            memory: null,
        };
    }));

    ipcMain.handle('system:save-config', wrapIpcHandler(async (_, updates) => {
        const configPath = getConfigPath(__dirname);
        let currentConfig: Record<string, unknown> = {};
        try {
            if (fs.existsSync(configPath)) {
                currentConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
            }
        } catch (e) {
            console.error('[Main] Error reading config for save:', e);
        }

        const updatesObj = typeof updates === 'object' && updates !== null
            ? updates as Record<string, unknown>
            : {};
        const mergedConfig = deepMergeConfig(currentConfig, updatesObj);
        const newConfig = normalizeAppConfig(mergedConfig);

        try {
            await fs.promises.writeFile(configPath, JSON.stringify(newConfig, null, 2));
            return newConfig;
        } catch (e) {
            console.error('[Main] Error writing config:', e);
            throw e;
        }
    }));

    // ── Backend API handlers (via ApiService) ─────────────────────────────
    ipcMain.handle('api:health', wrapIpcHandler(async () => {
        return await apiService.healthCheck();
    }));

    ipcMain.handle('api:is-available', wrapIpcHandler(async () => {
        return await apiService.isAvailable();
    }));

    ipcMain.handle('api:status', wrapIpcHandler(async () => {
        return await apiService.getStatus();
    }));

    ipcMain.handle('api:stats', wrapIpcHandler(async () => {
        return await apiService.getStats();
    }));

    // Scoring
    ipcMain.handle('api:scoring-start', wrapIpcHandler(async (_, opts) => {
        return await apiService.startScoring(opts);
    }));

    ipcMain.handle('api:scoring-stop', wrapIpcHandler(async () => {
        return await apiService.stopScoring();
    }));

    ipcMain.handle('api:scoring-status', wrapIpcHandler(async () => {
        return await apiService.getScoringStatus();
    }));

    ipcMain.handle('api:scoring-single', wrapIpcHandler(async (_, filePath: string) => {
        return await apiService.scoreSingleImage(filePath);
    }));

    // Tagging
    ipcMain.handle('api:tagging-start', wrapIpcHandler(async (_, opts) => {
        return await apiService.startTagging(opts);
    }));

    ipcMain.handle('api:tagging-stop', wrapIpcHandler(async () => {
        return await apiService.stopTagging();
    }));

    ipcMain.handle('api:tagging-status', wrapIpcHandler(async () => {
        return await apiService.getTaggingStatus();
    }));

    ipcMain.handle('api:tagging-single', wrapIpcHandler(async (_, opts) => {
        return await apiService.tagSingleImage(opts);
    }));

    ipcMain.handle('api:tagging-propagate', wrapIpcHandler(async (_, opts) => {
        return await apiService.propagateTags(opts);
    }));

    // Clustering
    ipcMain.handle('api:clustering-start', wrapIpcHandler(async (_, opts) => {
        return await apiService.startClustering(opts);
    }));

    ipcMain.handle('api:clustering-stop', wrapIpcHandler(async () => {
        return await apiService.stopClustering();
    }));

    ipcMain.handle('api:clustering-status', wrapIpcHandler(async () => {
        return await apiService.getClusteringStatus();
    }));

    // Pipeline
    ipcMain.handle('api:pipeline-submit', wrapIpcHandler(async (_, opts) => {
        return await apiService.submitPipeline(opts);
    }));

    ipcMain.handle('api:pipeline-skip', wrapIpcHandler(async (_, opts) => {
        return await apiService.skipPipelinePhase(opts);
    }));

    ipcMain.handle('api:pipeline-retry', wrapIpcHandler(async (_, opts) => {
        return await apiService.retryPipelinePhase(opts);
    }));

    // Jobs
    ipcMain.handle('api:status-all', wrapIpcHandler(async () => {
        return await apiService.getAllStatus();
    }));

    ipcMain.handle('api:jobs-queue', wrapIpcHandler(async (_, limit?: number) => {
        return await apiService.getJobsQueue(limit);
    }));

    ipcMain.handle('api:job-cancel', wrapIpcHandler(async (_, jobId: string | number) => {
        return await apiService.cancelJob(jobId);
    }));

    ipcMain.handle('api:jobs-recent', wrapIpcHandler(async () => {
        return await apiService.getRecentJobs();
    }));

    ipcMain.handle('api:job-detail', wrapIpcHandler(async (_, jobId: string | number) => {
        return await apiService.getJob(jobId);
    }));

    // Scope tree (per-folder phase status from the backend phase summary table)
    ipcMain.handle('api:get-scope-tree', wrapIpcHandler(async () => {
        return await apiService.getScopeTree();
    }));

    console.log('[Main] All IPC handlers registered. Creating window...');
    createWindow();
    rebuildApplicationMenu();
}

if (webuiShellOnlyUrl) {
    app.whenReady().then(() => {
        Menu.setApplicationMenu(null);
        createWebuiShellWindow(webuiShellOnlyUrl);
    });
} else {
    app.whenReady().then(() => void startFullApplication());
}




app.on('window-all-closed', async () => {
    // Close persistent database connection
    db.closeConnection();

    // Cleanup exiftool resources
    await nefExtractor.cleanup();
    await exiftool.end();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (webuiShellOnlyUrl) {
        if (webuiShellWindow === null || webuiShellWindow.isDestroyed()) {
            createWebuiShellWindow(webuiShellOnlyUrl);
        }
        return;
    }
    if (mainWindow === null) {
        createWindow();
    }
});
