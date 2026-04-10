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
import {
    ExportImageContext,
    type FileImageMetadataDetail,
    type FileImageMetadataResult,
    type FsDirEntry,
    type FsReadDirResult,
    type BackupTargetInfo,
    BackupProgress,
    BackupResult,
    BackupManifest,
    BackupManifestEntry,
    type ScoredImageForBackup,
} from './types';
import { SessionLogManager } from './sessionLogManager';
import { deepMergeConfig, getConfigPath, loadAppConfig, normalizeAppConfig } from './config';
import { resolveBackendUiStaticDir, startScoringUiServer, type ScoringUiServer } from './scoringUiServer';
import { normalizeLensFolderName, UNKNOWN_LENS_FOLDER } from './lensFolderName';
import { collapseMalformedThumbnailSegments, absolutizeThumbnailPath } from './thumbnailPathNormalize';

/** Verbose `media://` request logging (default off in dev — huge galleries flood the console). */
function debugGalleryMedia(): boolean {
    return process.env.DEBUG_GALLERY_MEDIA === '1';
}

let mediaMissingLogCount = 0;
const MEDIA_MISSING_LOG_MAX = 12;

/** Placeholder when camera model cannot be derived; sync/backup must not create this folder. */
const UNKNOWN_CAMERA_FOLDER = '_unknown_camera';

function isUnresolvedSyncLayout(camera: string, lens: string): boolean {
    return camera === UNKNOWN_CAMERA_FOLDER || lens === UNKNOWN_LENS_FOLDER;
}

const exiftool = new ExifTool({ maxProcs: 6 });

function convertFsImagePathForExif(filePath: string): string {
    let convertedPath = filePath;
    if (process.platform === 'win32' && filePath.match(/^\/mnt\/[a-zA-Z]\//)) {
        convertedPath = filePath.replace(/^\/mnt\/([a-zA-Z])\//, '$1:/');
    }
    return convertedPath;
}

/** XMP sidecar wins for these tag names when merging over embedded image tags. */
const XMP_MERGE_KEYS = new Set([
    'Title',
    'ObjectName',
    'Headline',
    'Description',
    'ImageDescription',
    'Caption',
    'Caption-Abstract',
    'CaptionAbstract',
    'Subject',
    'Keywords',
    'HierarchicalSubject',
    'LastKeywordXMP',
    'Rating',
    'XMPRating',
    'Label',
    'ColorLabels',
]);

function tagsToSerializable(tags: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(tags)) {
        const v = tags[key];
        if (v === undefined) continue;
        if (v === null) {
            out[key] = null;
            continue;
        }
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') {
            out[key] = v;
        } else if (Array.isArray(v)) {
            out[key] = v.map((item) =>
                item !== null && typeof item === 'object' ? String(item) : item,
            );
        } else {
            out[key] = String(v);
        }
    }
    return out;
}

async function readExiftoolAsPlain(filePath: string): Promise<Record<string, unknown>> {
    const tags = await exiftool.read(filePath);
    return tagsToSerializable(tags as unknown as Record<string, unknown>);
}

function mergeXmpOverImage(
    imageTags: Record<string, unknown>,
    xmpTags: Record<string, unknown>,
): Record<string, unknown> {
    const merged = { ...imageTags };
    for (const key of Object.keys(xmpTags)) {
        if (!XMP_MERGE_KEYS.has(key)) continue;
        const v = xmpTags[key];
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        merged[key] = v;
    }
    return merged;
}

function metadataDetailFromTags(m: Record<string, unknown>): FileImageMetadataDetail {
    const title = [m.Title, m.ObjectName, m.Headline].find(
        (x) => typeof x === 'string' && x.trim(),
    ) as string | undefined;
    const description = [
        m.Description,
        m.ImageDescription,
        m.Caption,
        m['Caption-Abstract'],
        m.CaptionAbstract,
    ].find((x) => typeof x === 'string' && x.trim()) as string | undefined;

    let keywords = '';
    const kw = m.Keywords ?? m.Subject;
    if (Array.isArray(kw)) {
        keywords = kw.map(String).filter(Boolean).join(', ');
    } else if (typeof kw === 'string') {
        keywords = kw;
    }

    let rating = 0;
    const r = m.Rating ?? m.XMPRating;
    if (typeof r === 'number' && !Number.isNaN(r)) {
        rating = Math.max(0, Math.round(r));
    } else if (typeof r === 'string') {
        const n = parseInt(r, 10);
        if (!Number.isNaN(n)) rating = Math.max(0, n);
    }

    const labelRaw = m.Label ?? m.ColorLabels;
    const label = labelRaw !== undefined && labelRaw !== null ? String(labelRaw) : null;

    const iso = m.ISO;
    let exif_iso: number | null = null;
    if (typeof iso === 'number' && !Number.isNaN(iso)) exif_iso = iso;
    else if (typeof iso === 'string') {
        const n = parseFloat(iso);
        exif_iso = Number.isNaN(n) ? null : n;
    }

    let exif_shutter: string | null = null;
    const ss = m.ShutterSpeed ?? m.ExposureTime;
    if (ss !== undefined && ss !== null) exif_shutter = String(ss);

    let exif_aperture: string | null = null;
    const ap = m.Aperture ?? m.FNumber;
    if (ap !== undefined && ap !== null) exif_aperture = String(ap);

    const fl = m.FocalLength;
    const exif_focal_length = fl !== undefined && fl !== null ? String(fl) : null;

    const mod = m.Model ?? m.CameraModelName;
    const exif_model = mod !== undefined && mod !== null ? String(mod) : null;

    const lens = m.LensModel ?? m.Lens;
    const exif_lens_model = lens !== undefined && lens !== null ? String(lens) : null;

    return {
        title: title?.trim() || undefined,
        description: description?.trim() || undefined,
        keywords: keywords || undefined,
        rating,
        label,
        exif_iso,
        exif_shutter,
        exif_aperture,
        exif_focal_length,
        exif_model,
        exif_lens_model,
    };
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// if (require('electron-squirrel-startup')) {
//     app.quit();
// }

let mainWindow: BrowserWindow | null = null;
let scoringWindow: BrowserWindow | null = null;
/** Set when launched with --webui-shell=URL (backend WebUI in a dedicated window). */
let webuiShellWindow: BrowserWindow | null = null;
let currentExportImageContext: ExportImageContext | null = null;
let sessionLogManager: SessionLogManager | null = null;

let appGalleryMode: 'db' | 'folder' = 'db';
let isBackupRunning = false;
/** True while `sync:run` (copy/import) is executing. */
let isSyncRunInProgress = false;
/** Number of in-flight `sync:preview` IPC calls (StrictMode can overlap two). */
let activeSyncPreviewCount = 0;

const FS_IMAGE_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tif', '.tiff', '.heic', '.heif',
    '.nef', '.nrw', '.cr2', '.cr3', '.arw', '.orf', '.rw2', '.dng',
]);

function defaultLightModeRoot(): string {
    const pictures = path.join(os.homedir(), 'Pictures');
    if (process.platform === 'win32') {
        if (fs.existsSync(pictures)) {
            return pictures;
        }
        return 'D:\\Photos';
    }
    return pictures;
}

function readLightModeRootFromConfig(): string {
    try {
        const configPath = getConfigPath(__dirname);
        if (fs.existsSync(configPath)) {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { lightModeRootFolder?: string };
            if (typeof raw.lightModeRootFolder === 'string' && raw.lightModeRootFolder.trim()) {
                return path.resolve(raw.lightModeRootFolder.trim());
            }
        }
    } catch {
        /* ignore */
    }
    return path.resolve(defaultLightModeRoot());
}

function isPathInsideLightRoot(root: string, target: string): boolean {
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(target);
    if (resolvedTarget === resolvedRoot) {
        return true;
    }
    const rel = path.relative(resolvedRoot, resolvedTarget);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Thumbnails may not exist at the exact path from the DB:
 * - Repo renamed to image-scoring-backend while JPEGs still live under .../image-scoring/thumbnails
 * - DB stores flat thumbnails/<hash>.jpg but on-disk layout is nested thumbnails/<aa>/<hash>.jpg
 */
function resolveMediaFilePathWithFallbacks(normalizedPath: string): string {
    normalizedPath = collapseMalformedThumbnailSegments(normalizedPath);

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
 * Map a media:// request URL to a filesystem path segment (before resolve/normalize).
 * Chromium parses `media://D:/path` as host "D" + pathname "/path"; recover the drive letter on Windows.
 * Correct `media:///D:/path` yields pathname "/D:/path".
 */
function parseMediaUrlToFilePath(requestUrl: string): string {
    const u = new URL(requestUrl);
    
    let filePath = u.searchParams.get('path');
    if (!filePath) {
        let pathname = u.pathname;
        try {
            pathname = decodeURIComponent(pathname);
        } catch {
            throw new Error('invalid encoding');
        }

        if (process.platform === 'win32' && /^[a-zA-Z]$/.test(u.hostname) && pathname.length > 1) {
            return `${u.hostname.toUpperCase()}:${pathname}`;
        }
        filePath = pathname;
    }

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
            const tagsToRead = currentExportImageContext.exifOrientationBaked
                ? preserveTags.filter((tag) => tag !== 'Orientation')
                : preserveTags;

            for (const tag of tagsToRead) {
                if (sourceTags[tag as keyof typeof sourceTags] !== undefined) {
                    tagsToCopy[tag] = sourceTags[tag as keyof typeof sourceTags];
                }
            }

            if (currentExportImageContext.exifOrientationBaked) {
                tagsToCopy.Orientation = 1;
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
    const folderMode = appGalleryMode === 'folder';

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
                    enabled: !folderMode,
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
                {
                    label: 'Sync',
                    enabled: !folderMode && !isSyncRunInProgress && activeSyncPreviewCount === 0 && !isBackupRunning,
                    click: async () => {
                        const win = getDialogWindow();
                        const result = await dialog.showOpenDialog(win || mainWindow!, {
                            properties: ['openDirectory'],
                            title: 'Select source drive or folder to sync from'
                        });
                        if (!result.canceled && result.filePaths[0]) {
                            mainWindow?.webContents.send('sync:source-selected', result.filePaths[0]);
                        }
                    }
                },
                {
                    label: 'Backup',
                    enabled: !folderMode && !isBackupRunning && !isSyncRunInProgress && activeSyncPreviewCount === 0,
                    click: async () => {
                        const win = getDialogWindow();
                        const result = await dialog.showOpenDialog(win || mainWindow!, {
                            properties: ['openDirectory', 'createDirectory'],
                            title: 'Select Destination Folder for Backup'
                        });
                        if (!result.canceled && result.filePaths[0]) {
                            mainWindow?.webContents.send('backup:target-selected', result.filePaths[0]);
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
                    enabled: !folderMode,
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-diagnostics');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Runs',
                    enabled: !folderMode,
                    click: () => {
                        mainWindow?.webContents.send('open-runs');
                    }
                },
                {
                    label: 'Duplicates',
                    enabled: !folderMode,
                    click: () => {
                        mainWindow?.webContents.send('open-duplicates');
                    }
                },
                {
                    label: 'Embeddings',
                    enabled: !folderMode,
                    click: () => {
                        mainWindow?.webContents.send('open-embeddings');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Scoring...',
                    enabled: !folderMode,
                    click: () => {
                        openScoringWindow();
                    }
                }
            ]
        },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                { type: 'separator' },
                {
                    label: 'Mode: DB',
                    type: 'radio',
                    checked: appGalleryMode === 'db',
                    click: () => setGalleryModeAndNotify('db'),
                },
                {
                    label: 'Mode: Folder',
                    type: 'radio',
                    checked: appGalleryMode === 'folder',
                    click: () => setGalleryModeAndNotify('folder'),
                },
            ],
        },
        { role: 'windowMenu' },

    ]);

    Menu.setApplicationMenu(menu);
};

function setGalleryModeAndNotify(mode: 'db' | 'folder') {
    appGalleryMode = mode;
    rebuildApplicationMenu();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-mode-changed', mode);
    }
}

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

    // Handle media:// requests with path sanitization
    protocol.handle('media', (request) => {
        if (debugGalleryMedia()) {
            console.log('[Main] Media request:', request.url);
        }
        try {
            let filePath: string;
            try {
                filePath = parseMediaUrlToFilePath(request.url);
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

            // media:///D:/... → /D:/... in pathname — normalize to D:/...
            if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(filePath)) {
                filePath = filePath.slice(1);
            }

            // Convert any DB-persisted root (like /app/thumbnails or ../../) to an absolute host path.
            // This safely passes through paths that are ALREADY host absolute.
            const projectRoot = path.resolve(__dirname, '..');
            filePath = absolutizeThumbnailPath(filePath, projectRoot, config?.paths?.thumbnail_base_dir);

            // Check before path.resolve: resolve() always yields an absolute path, so the old
            // check on normalizedPath could not block relative paths like d/Projects/... (bad URL parse).
            if (!path.isAbsolute(filePath)) {
                console.error('[Main] Media blocked (non-absolute path after parse):', filePath, '| url=', request.url);
                return new Response('Access denied', { status: 403 });
            }

            const resolvedPath = path.resolve(filePath);
            const normalizedPath = path.normalize(resolvedPath);

            const mediaPath = resolveMediaFilePathWithFallbacks(normalizedPath);
            if (mediaPath !== normalizedPath && fs.existsSync(mediaPath)) {
                if (isDev || debugGalleryMedia()) {
                    console.log('[Main] Media path fallback:', normalizedPath, '->', mediaPath);
                }
            }

            if (!fs.existsSync(mediaPath)) {
                if (mediaMissingLogCount < MEDIA_MISSING_LOG_MAX) {
                    console.warn(
                        '[Main] Media file missing:',
                        mediaPath,
                        '| requested URL:',
                        request.url,
                        normalizedPath !== mediaPath ? `(tried flat: ${normalizedPath})` : '',
                    );
                    mediaMissingLogCount += 1;
                } else if (mediaMissingLogCount === MEDIA_MISSING_LOG_MAX) {
                    console.warn(
                        '[Main] Media file missing: further messages suppressed (set DEBUG_GALLERY_MEDIA=1 for per-request logs).',
                    );
                    mediaMissingLogCount += 1;
                }
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

    ipcMain.handle('db:rebuild-stack-cache', wrapIpcHandler(async (_, context) => {
        const count = await db.rebuildStackCache(context ?? {});
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

    ipcMain.handle('backup:check-target', wrapIpcHandler(async (_, targetPath: string): Promise<BackupTargetInfo | null> => {
        if (!targetPath) return null;
        const manifestPath = path.join(targetPath, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            return { exists: false, imageCount: 0, lastBackup: null, bytes: 0 };
        }
        try {
            const content = await fs.promises.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(content) as BackupManifest;
            const stats = await fs.promises.stat(manifestPath);
            return {
                exists: true,
                imageCount: manifest.images.length,
                lastBackup: manifest.updatedAt,
                bytes: manifest.images.reduce((sum: number, img: any) => sum + (img.size || 0), 0)
            };
        } catch (e) {
            console.error('[Main] Backup: failed to read manifest:', e);
            return null;
        }
    }));

    ipcMain.handle('backup:run', wrapIpcHandler(async (_event, arg1, arg2, arg3) => {
        const payload =
            arg1 && typeof arg1 === 'object' && 'targetPath' in (arg1 as object)
                ? (arg1 as { targetPath: string; minScore: number; similarityThreshold: number })
                : { targetPath: arg1 as string, minScore: arg2 as number, similarityThreshold: arg3 as number };
        const { targetPath, minScore, similarityThreshold } = payload;

        if (!targetPath || typeof targetPath !== 'string') {
            throw new Error('Backup target path is required');
        }
        if (typeof minScore !== 'number' || Number.isNaN(minScore)) {
            throw new Error('minScore is required');
        }
        if (typeof similarityThreshold !== 'number' || Number.isNaN(similarityThreshold)) {
            throw new Error('similarityThreshold is required');
        }

        if (isBackupRunning) {
            throw new Error('Another backup is already in progress.');
        }
        if (isSyncRunInProgress || activeSyncPreviewCount > 0) {
            throw new Error('A sync operation is in progress. Finish sync before running backup.');
        }

        isBackupRunning = true;
        rebuildApplicationMenu();

        const sendProgress = (progress: BackupProgress) => {
            mainWindow?.webContents.send('backup:progress', progress);
        };

        try {
            const manifestPath = path.join(targetPath, 'manifest.json');
            let manifest: BackupManifest = { updatedAt: new Date().toISOString(), images: [] };
            if (fs.existsSync(manifestPath)) {
                try {
                    const content = await fs.promises.readFile(manifestPath, 'utf-8');
                    manifest = JSON.parse(content);
                } catch { /* ignore corrupted manifest */ }
            }

            sendProgress({ phase: 'scanning', current: 0, total: 0, detail: 'Querying rated images...' });
            
            // Get all scored images (above minScore)
            let allScored: ScoredImageForBackup[] = [];
            try {
                allScored = await db.getAllScoredImagesForBackup(minScore);
            } catch (e) {
                console.error('[Main] Backup: failed to query images:', e);
                return { copied: 0, skipped: 0, deduplicated: 0, errors: [String(e)] };
            }

            const totalImages = allScored.length;
            if (totalImages === 0) {
                sendProgress({ phase: 'done', current: 0, total: 0, detail: 'No images found matching criteria' });
                return { copied: 0, skipped: 0, deduplicated: 0, errors: [] };
            }

            // Group by date (YYYY-MM-DD) for locality in similarity checks
            const groups = new Map<string, typeof allScored>();
            for (const img of allScored) {
                const date = img.path.match(/(\d{4}-\d{2}-\d{2})/) ? img.path.match(/(\d{4}-\d{2}-\d{2})/)![1] : 'unknown';
                if (!groups.has(date)) groups.set(date, []);
                groups.get(date)!.push(img);
            }

            sendProgress({ phase: 'deduplicating', current: 0, total: groups.size, detail: `Analyzing ${totalImages} images in ${groups.size} groups...` });

            const selectedImages = new Set<number>();
            const rejectedImages = new Set<number>();
            let groupIdx = 0;

            for (const [date, group] of groups.entries()) {
                groupIdx++;
                sendProgress({ phase: 'deduplicating', current: groupIdx, total: groups.size, detail: `Grouping ${date} (${group.length} images)...` });

            const imageIds = group.map(img => img.id);
            const similarPairs = await db.getSimilarPairsInGroup(imageIds, similarityThreshold);

            // Build adjacency list for clusters
            const adj = new Map<number, number[]>();
            for (const pair of similarPairs) {
                if (!adj.has(pair.id_a)) adj.set(pair.id_a, []);
                if (!adj.has(pair.id_b)) adj.set(pair.id_b, []);
                adj.get(pair.id_a)!.push(pair.id_b);
                adj.get(pair.id_b)!.push(pair.id_a);
            }

            const visited = new Set<number>();
            for (const img of group) {
                if (visited.has(img.id)) continue;

                // BFS to find cluster
                const cluster = [img.id];
                const queue = [img.id];
                visited.add(img.id);

                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    const neighbors = adj.get(curr) || [];
                    for (const next of neighbors) {
                        if (!visited.has(next)) {
                            visited.add(next);
                            cluster.push(next);
                            queue.push(next);
                        }
                    }
                }

                // Pick the best from cluster
                const clusterDocs = group.filter(i => cluster.includes(i.id));
                clusterDocs.sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
                selectedImages.add(clusterDocs[0].id);
                for (let i = 1; i < clusterDocs.length; i++) {
                    rejectedImages.add(clusterDocs[i].id);
                }
            }
            }

            const toBackup = allScored.filter(img => selectedImages.has(img.id));
            sendProgress({
                phase: 'calculating',
                current: 0,
                total: Math.max(1, toBackup.length),
                detail: `Preparing ${toBackup.length} files to copy...`,
            });

            sendProgress({ phase: 'copying', current: 0, total: toBackup.length, detail: 'Starting file transfer...' });

            const existingRelPaths = new Set(manifest.images.map((img: BackupManifestEntry) => img.relPath));
            let copied = 0;
            let skipped = 0;
            const errors: string[] = [];

            for (let i = 0; i < toBackup.length; i++) {
                const img = toBackup[i];
                const fileName = path.basename(img.path);
                
                // Get metadata for naming
                const details = await db.getImageDetails(img.id);
                const camera = normalizeCameraModel(details?.exif_model);
                const lens = normalizeLensFolderName(details?.exif_lens_model);
                if (isUnresolvedSyncLayout(camera, lens)) {
                    console.warn(
                        `[Backup] Skip (missing camera/lens for layout): ${img.path} exif_model=${details?.exif_model ?? '—'} exif_lens_model=${details?.exif_lens_model ?? '—'}`
                    );
                    skipped++;
                    continue;
                }
                const dateMatch = img.path.match(/(\d{4}-\d{2}-\d{2})/);
                const dateStr = dateMatch ? dateMatch[1] : 'unknown';
                const year = dateStr.split('-')[0];

                const relDir = path.join(camera, lens, year, dateStr);
                const relPath = path.join(relDir, fileName);
                const destPath = path.join(targetPath, relPath);

                sendProgress({ phase: 'copying', current: i + 1, total: toBackup.length, detail: fileName });

                if (existingRelPaths.has(relPath) && fs.existsSync(destPath)) {
                    const manifestEntry = manifest.images.find((m: BackupManifestEntry) => m.relPath === relPath);
                    let skipFile = false;
                    if (manifestEntry && manifestEntry.size > 0) {
                        try {
                            const st = await fs.promises.stat(destPath);
                            skipFile = st.size === manifestEntry.size;
                        } catch {
                            skipFile = false;
                        }
                    } else {
                        skipFile = true;
                    }
                    if (skipFile) {
                        skipped++;
                        continue;
                    }
                }

                try {
                    await fs.promises.mkdir(path.join(targetPath, relDir), { recursive: true });
                    const stats = await fs.promises.stat(img.path);
                    await fs.promises.copyFile(img.path, destPath);
                    
                    // Update manifest item
                    const manifestIdx = manifest.images.findIndex((m: BackupManifestEntry) => m.relPath === relPath);
                    const item: BackupManifestEntry = {
                        id: img.id,
                        relPath,
                        score: img.composite_score || 0,
                        size: stats.size,
                        hash: img.image_hash || ''
                    };
                    if (manifestIdx >= 0) manifest.images[manifestIdx] = item;
                    else manifest.images.push(item);
                    
                    copied++;
                } catch (e) {
                    errors.push(`${fileName}: ${e instanceof Error ? e.message : String(e)}`);
                }
            }

            sendProgress({ phase: 'cleaning', current: 1, total: 1, detail: 'Writing manifest...' });
            manifest.updatedAt = new Date().toISOString();
            await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

            sendProgress({ phase: 'done', current: toBackup.length, total: toBackup.length, detail: `Backup complete: ${copied} copied, ${skipped} skipped.` });
            return { 
                copied, 
                skipped, 
                deduplicated: rejectedImages.size,
                errors 
            };
        } finally {
            isBackupRunning = false;
            rebuildApplicationMenu();
        }
    }));

    ipcMain.handle('import:run', wrapIpcHandler(async (_, folderPath: string) => {
        if (!folderPath || typeof folderPath !== 'string') {
            throw new Error('Folder path is required');
        }
        const stat = await fs.promises.stat(folderPath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${folderPath}`);
        }

        // Try API first (Gradio backend); fallback to direct local DB
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
            console.log('[Main] Gradio not available, using direct local DB for import');
        }

        // Fallback: direct local DB
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

                const newImageId = await db.insertImage({
                    file_path: filePath,
                    file_name: fileName,
                    file_type: fileType,
                    folder_id: folderId,
                    image_uuid: imageUuid
                });
                try {
                    await db.markImageIndexingPhaseDone(newImageId);
                } catch (phaseErr) {
                    console.warn('[Main] Import: markImageIndexingPhaseDone failed:', phaseErr);
                }
                added++;
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                errors.push(`${fileName}: ${msg}`);
            }
        }

        return { added, skipped, errors };
    }));

    // ── Sync: copy new photos from external source into structured local tree, then import ──

    /** Normalize camera model for folder names (e.g. "NIKON Z 8" → "Z8"). */
    function normalizeCameraModel(raw: string | undefined | null): string {
        if (!raw) return UNKNOWN_CAMERA_FOLDER;
        const s = raw.trim();
        // Nikon Z-series shortcuts
        const zMatch = s.match(/Z\s*(\d+)(?:[_\s]*(II|2|III|3))?/i);
        if (zMatch) {
            const num = zMatch[1];
            const gen = (zMatch[2] || '').toLowerCase();
            const genSuffix = gen === 'ii' || gen === '2' ? 'ii' : gen === 'iii' || gen === '3' ? 'iii' : '';
            return `Z${num}${genSuffix}`;
        }
        // Fallback: sanitize for filesystem
        return s.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').substring(0, 60);
    }

    /** Recursively collect image files from a directory. */
    /** Sync only processes Nikon RAW files. */
    const SYNC_EXTENSIONS = new Set(['.nef']);

    async function collectImageFiles(dir: string): Promise<string[]> {
        const result: string[] = [];
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const sub = await collectImageFiles(fullPath);
                result.push(...sub);
            } else if (entry.isFile() && SYNC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                result.push(fullPath);
            }
        }
        return result;
    }

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    function maxIsoDate(a: string | null, b: string | null): string | null {
        if (!a && !b) return null;
        if (!a) return b;
        if (!b) return a;
        return a >= b ? a : b;
    }

    /**
     * Detect the threshold date for sync: photos on or before this date are
     * presumed already synced and can be bypassed by an EXIF quick-skip check.
     *
     * Heuristics (combined, then 1-day safety margin):
     * 1. Walk destRoot for leaf folders named YYYY-MM-DD (sync layout).
     * 2. Max shoot date from indexed rows: COALESCE(image_exif.date_time_original, create_date).
     * 3. If (1) and (2) both missing, fall back to MAX(images.created_at)::date (import time).
     *
     * The highest YYYY-MM-DD among (1) and (2) is the watermark; (3) only if both absent.
     * Margin subtracts one day so the last sync day is always re-checked (EXIF vs threshold).
     */
    async function detectSyncThresholdDate(destRoot: string): Promise<string | null> {
        let latestDateFolder: string | null = null;

        try {
            const datePattern = /^\d{4}-\d{2}-\d{2}$/;
            const cameraDirs = await fs.promises.readdir(destRoot, { withFileTypes: true }).catch(() => []);
            for (const cam of cameraDirs) {
                if (!cam.isDirectory()) continue;
                const lensDirs = await fs.promises.readdir(path.join(destRoot, cam.name), { withFileTypes: true }).catch(() => []);
                for (const lens of lensDirs) {
                    if (!lens.isDirectory()) continue;
                    const yearDirs = await fs.promises.readdir(path.join(destRoot, cam.name, lens.name), { withFileTypes: true }).catch(() => []);
                    for (const yr of yearDirs) {
                        if (!yr.isDirectory()) continue;
                        const dateDirs = await fs.promises.readdir(path.join(destRoot, cam.name, lens.name, yr.name), { withFileTypes: true }).catch(() => []);
                        for (const dd of dateDirs) {
                            if (dd.isDirectory() && datePattern.test(dd.name)) {
                                if (!latestDateFolder || dd.name > latestDateFolder) {
                                    latestDateFolder = dd.name;
                                }
                            }
                        }
                    }
                }
            }
        } catch {
            // destRoot may not exist yet — that's fine
        }

        let dbMaxCapture: string | null = null;
        let dbMaxCreated: string | null = null;
        try {
            [dbMaxCapture, dbMaxCreated] = await Promise.all([
                db.getMaxIndexedCaptureDateUnderDestRoot(destRoot),
                db.getMaxIndexedCreatedDateUnderDestRoot(destRoot),
            ]);
        } catch (e) {
            console.warn('[Sync] DB threshold queries failed:', e);
        }

        let watermark: string | null = maxIsoDate(
            latestDateFolder && ISO_DATE.test(latestDateFolder) ? latestDateFolder : null,
            dbMaxCapture && ISO_DATE.test(dbMaxCapture) ? dbMaxCapture : null
        );

        if (!watermark) {
            watermark = dbMaxCreated && ISO_DATE.test(dbMaxCreated) ? dbMaxCreated : null;
        }

        if (!watermark) {
            console.log('[Sync] No threshold detected — will process all files');
            return null;
        }

        const d = new Date(watermark + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        const margin = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const usedCreatedFallback =
            watermark === dbMaxCreated &&
            !maxIsoDate(
                latestDateFolder && ISO_DATE.test(latestDateFolder) ? latestDateFolder : null,
                dbMaxCapture && ISO_DATE.test(dbMaxCapture) ? dbMaxCapture : null
            );
        console.log(
            `[Sync] Watermark ${watermark} (folder=${latestDateFolder ?? '—'} exif_max=${dbMaxCapture ?? '—'} created_max=${dbMaxCreated ?? '—'}${usedCreatedFallback ? ' [used created_at fallback]' : ''}) → skip ≤ ${margin} (1-day margin)`
        );
        return margin;
    }

    /** Relative path under dest root with forward slashes for UI. */
    function syncRelDisplay(destRoot: string, absolute: string): string {
        return path.relative(destRoot, absolute).split(path.sep).join('/');
    }

    /**
     * Core sync: threshold, scan, EXIF/DB per file, copy (+ import when not dryRun).
     * Preview (dryRun) uses the same EXIF/DB passes without mkdir/copy/import; a follow-up full sync
     * repeats that work (acceptable for typical card sizes; cache not implemented).
     */
    type SyncFromSourceResult =
        | {
              dryRun: true;
              thresholdDate: string | null;
              destinationRoot: string;
              scanned: number;
              skipped: number;
              wouldCopy: number;
              importOnly: number;
              newFolders: string[];
              errors: string[];
          }
        | {
              dryRun: false;
              scanned: number;
              copied: number;
              imported: number;
              skipped: number;
              folders: number;
              errors: string[];
              thresholdDate: string | null;
          };

    async function runSyncFromSource(sourcePath: string, dryRun: boolean): Promise<SyncFromSourceResult> {
        const currentConfig = loadConfig();
        const destRoot = (currentConfig?.sync?.destinationRoot || 'D:\\Photos').replace(/\//g, '\\');
        if (!dryRun) {
            console.log(`[Main] Sync: source=${sourcePath}, dest=${destRoot}`);
        }

        mainWindow?.webContents.send('sync:progress', {
            phase: 'detecting', current: 0, total: 0, detail: 'Detecting last sync date...'
        });

        const thresholdDate = await detectSyncThresholdDate(destRoot);

        mainWindow?.webContents.send('sync:progress', {
            phase: 'scanning', current: 0, total: 0,
            detail: thresholdDate
                ? `Scanning source (skipping files on or before ${thresholdDate})...`
                : 'Scanning source for images...'
        });

        const allFiles = await collectImageFiles(sourcePath);
        const totalScanned = allFiles.length;

        const candidates = allFiles;
        const skippedByDate = 0;

        if (candidates.length === 0) {
            mainWindow?.webContents.send('sync:progress', {
                phase: 'done', current: 0, total: 0,
                detail: dryRun ? 'Preview complete (nothing to process)' : 'Sync complete (nothing to copy)'
            });
            if (dryRun) {
                return {
                    dryRun: true,
                    thresholdDate,
                    destinationRoot: destRoot,
                    scanned: totalScanned,
                    skipped: skippedByDate,
                    wouldCopy: 0,
                    importOnly: 0,
                    newFolders: [],
                    errors: [],
                };
            }
            return {
                dryRun: false,
                scanned: totalScanned, copied: 0, imported: 0,
                skipped: skippedByDate, folders: 0, errors: [],
                thresholdDate,
            };
        }

        mainWindow?.webContents.send('sync:progress', {
            phase: 'scanning', current: totalScanned, total: totalScanned,
            detail: `Found ${totalScanned} image files`
        });

        const totalCandidates = candidates.length;
        let copied = 0;
        let wouldCopy = 0;
        let importOnly = 0;
        let skippedCount = skippedByDate;
        const errors: string[] = [];
        const newFolders = new Set<string>();
        const newFolderRelPaths = new Set<string>();

        const processPhase = dryRun ? 'preview' : 'copying';
        let processedCount = 0;
        const concurrencyLimit = 15; // Safe parallelism for exiftool + DB queries

        for (let batchStart = 0; batchStart < candidates.length; batchStart += concurrencyLimit) {
            const batch = candidates.slice(batchStart, batchStart + concurrencyLimit);

            await Promise.all(batch.map(async (filePath) => {
                const fileName = path.basename(filePath);

                try {
                    let dateStr: string | null = null;
                    let cameraModel: string | null = null;
                    let lensModel: string | null = null;
                    let imageUuid: string | null = null;

                    try {
                        const tags = await exiftool.read(filePath);

                        const dto = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
                        if (dto) {
                            const raw = typeof dto === 'string' ? dto : String(dto);
                            const match = raw.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/);
                            if (match) {
                                dateStr = `${match[1]}-${match[2]}-${match[3]}`;
                            }
                        }

                        cameraModel = (tags.Model as string) ?? null;
                        lensModel = (tags.LensModel as string) ?? (tags.Lens as string) ?? null;

                        const uid = tags.ImageUniqueID ?? tags.DocumentID ?? null;
                        if (uid && typeof uid === 'string') {
                            imageUuid = uid;
                        }
                    } catch {
                        // EXIF read failed; use file date fallback
                    }

                    if (!dateStr) {
                        const fstat = await fs.promises.stat(filePath);
                        const d = fstat.mtime;
                        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    }

                    const camera = normalizeCameraModel(cameraModel);
                    const lens = normalizeLensFolderName(lensModel);
                    if (isUnresolvedSyncLayout(camera, lens)) {
                        console.warn(
                            `[Sync] Skip (missing camera/lens for layout): ${filePath} exif_model=${cameraModel ?? '—'} exif_lens=${lensModel ?? '—'}`
                        );
                        skippedCount++;
                        return;
                    }

                    if (thresholdDate && dateStr <= thresholdDate) {
                        if (imageUuid) {
                            const existsByUuid = await db.findImageByUuid(imageUuid);
                            if (existsByUuid) {
                                skippedCount++;
                                return;
                            }
                        }
                        const year = dateStr.substring(0, 4);
                        const destFileEarly = path.join(destRoot, camera, lens, year, dateStr, fileName);
                        if (await fs.promises.stat(destFileEarly).then(() => true, () => false)) {
                            skippedCount++;
                            return;
                        }
                    }

                    if (imageUuid) {
                        const existsByUuid = await db.findImageByUuid(imageUuid);
                        if (existsByUuid) {
                            skippedCount++;
                            return;
                        }
                    }

                    const year = dateStr.substring(0, 4);
                    const destDir = path.join(destRoot, camera, lens, year, dateStr);
                    const destFile = path.join(destDir, fileName);

                    if (await fs.promises.stat(destFile).then(() => true, () => false)) {
                        const existsByPath = await db.findImageByFilePath(destFile);
                        if (existsByPath) {
                            skippedCount++;
                            return;
                        }
                        if (dryRun) {
                            importOnly++;
                        }
                    } else {
                        if (dryRun) {
                            wouldCopy++;
                            const destDirExists = await fs.promises.stat(destDir).then(() => true, () => false);
                            if (!destDirExists) {
                                newFolderRelPaths.add(syncRelDisplay(destRoot, destDir));
                            }
                        } else {
                            await fs.promises.mkdir(destDir, { recursive: true });
                            await fs.promises.copyFile(filePath, destFile);
                            copied++;
                        }
                    }

                    if (!dryRun) {
                        newFolders.add(destDir);
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errors.push(`${fileName}: ${msg}`);
                } finally {
                    processedCount++;
                    if (processedCount % 5 === 0 || processedCount === totalCandidates) {
                        mainWindow?.webContents.send('sync:progress', {
                            phase: processPhase, current: processedCount, total: totalCandidates, detail: fileName
                        });
                    }
                }
            }));
        }

        if (dryRun) {
            const sortedFolders = Array.from(newFolderRelPaths).sort();
            mainWindow?.webContents.send('sync:progress', {
                phase: 'done', current: 0, total: 0, detail: 'Preview complete'
            });
            return {
                dryRun: true,
                thresholdDate,
                destinationRoot: destRoot,
                scanned: totalScanned,
                skipped: skippedCount,
                wouldCopy,
                importOnly,
                newFolders: sortedFolders,
                errors,
            };
        }

        const foldersToImport = Array.from(newFolders);
        let imported = 0;
        const importErrors: string[] = [];

        for (let i = 0; i < foldersToImport.length; i++) {
            const folderPath = foldersToImport[i];
            mainWindow?.webContents.send('sync:progress', {
                phase: 'importing', current: i + 1, total: foldersToImport.length,
                detail: path.relative(destRoot, folderPath)
            });

            try {
                const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
                const files = entries
                    .filter(e => e.isFile())
                    .map(e => path.join(folderPath, e.name))
                    .filter(p => SYNC_EXTENSIONS.has(path.extname(p).toLowerCase()));

                const folderId = await db.getOrCreateFolder(folderPath);

                for (const fp of files) {
                    const fn = path.basename(fp);
                    const ft = path.extname(fp).toLowerCase().replace(/^\./, '') || 'unknown';

                    try {
                        const existsByPath = await db.findImageByFilePath(fp);
                        if (existsByPath) continue;

                        let uuid: string | null = null;
                        try {
                            const tags = await exiftool.read(fp);
                            const uid = tags.ImageUniqueID ?? tags.DocumentID ?? null;
                            if (uid && typeof uid === 'string') {
                                uuid = uid;
                                const existsByUuid = await db.findImageByUuid(uuid);
                                if (existsByUuid) continue;
                            }
                        } catch { /* proceed without UUID */ }

                        await db.insertImage({
                            file_path: fp,
                            file_name: fn,
                            file_type: ft,
                            folder_id: folderId,
                            image_uuid: uuid,
                        });
                        imported++;
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        importErrors.push(`${fn}: ${msg}`);
                    }
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                importErrors.push(`folder ${folderPath}: ${msg}`);
            }
        }

        errors.push(...importErrors);

        mainWindow?.webContents.send('sync:progress', {
            phase: 'done', current: 0, total: 0, detail: 'Sync complete'
        });

        return {
            dryRun: false,
            scanned: totalScanned,
            copied,
            imported,
            skipped: skippedCount,
            folders: foldersToImport.length,
            errors,
            thresholdDate,
        };
    }

    ipcMain.handle('sync:preview', wrapIpcHandler(async (_, sourcePath: string) => {
        if (!sourcePath || typeof sourcePath !== 'string') {
            throw new Error('Source path is required');
        }
        const stat = await fs.promises.stat(sourcePath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${sourcePath}`);
        }
        if (isBackupRunning) {
            throw new Error('Backup is running. Finish backup before sync.');
        }
        if (isSyncRunInProgress) {
            throw new Error('A full sync is already in progress. Finish it before previewing.');
        }
        activeSyncPreviewCount++;
        rebuildApplicationMenu();
        try {
            console.log(`[Main] Sync preview: source=${sourcePath}`);
            const out = await runSyncFromSource(sourcePath, true);
            if (!out.dryRun) {
                throw new Error('Internal: expected preview result');
            }
            return {
                thresholdDate: out.thresholdDate,
                destinationRoot: out.destinationRoot,
                scanned: out.scanned,
                skipped: out.skipped,
                wouldCopy: out.wouldCopy,
                importOnly: out.importOnly,
                newFolders: out.newFolders,
                errors: out.errors,
            };
        } finally {
            activeSyncPreviewCount--;
            rebuildApplicationMenu();
        }
    }));

    ipcMain.handle('sync:run', wrapIpcHandler(async (_, sourcePath: string) => {
        if (!sourcePath || typeof sourcePath !== 'string') {
            throw new Error('Source path is required');
        }
        const stat = await fs.promises.stat(sourcePath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${sourcePath}`);
        }
        if (isBackupRunning) {
            throw new Error('Backup is running. Finish backup before sync.');
        }
        if (isSyncRunInProgress) {
            throw new Error('Another sync operation is already in progress.');
        }
        if (activeSyncPreviewCount > 0) {
            throw new Error('Sync preview is still running. Wait for it to finish before starting sync.');
        }
        isSyncRunInProgress = true;
        rebuildApplicationMenu();
        try {
            const out = await runSyncFromSource(sourcePath, false);
            if (out.dryRun) {
                throw new Error('Internal: expected sync result');
            }
            return {
                scanned: out.scanned,
                copied: out.copied,
                imported: out.imported,
                skipped: out.skipped,
                folders: out.folders,
                errors: out.errors,
                thresholdDate: out.thresholdDate,
            };
        } finally {
            isSyncRunInProgress = false;
            rebuildApplicationMenu();
        }
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

    ipcMain.handle('fs:read-image-metadata', wrapIpcHandler(async (_, filePath: string) => {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('file path required');
        }
        const convertedPath = convertFsImagePathForExif(filePath);
        let merged = await readExiftoolAsPlain(convertedPath);
        const dir = path.dirname(convertedPath);
        const base = path.basename(convertedPath, path.extname(convertedPath));
        const xmpPath = path.join(dir, `${base}.xmp`);
        try {
            await fs.promises.access(xmpPath, fs.constants.R_OK);
            const xmpPlain = await readExiftoolAsPlain(xmpPath);
            merged = mergeXmpOverImage(merged, xmpPlain);
        } catch {
            /* no readable sidecar */
        }
        const detail = metadataDetailFromTags(merged);
        const result: FileImageMetadataResult = { tags: merged, detail };
        return result;
    }));

    ipcMain.handle('fs:get-light-mode-root', wrapIpcHandler(async () => readLightModeRootFromConfig()));

    ipcMain.handle('fs:read-dir', wrapIpcHandler(async (_, args: {
        dirPath: string;
        offset?: number;
        limit?: number;
        kinds?: 'all' | 'dirsOnly';
    }) => {
        const rootPath = readLightModeRootFromConfig();
        const dirPath = typeof args?.dirPath === 'string' ? args.dirPath : '';
        const resolvedDir = path.resolve(dirPath);
        if (!isPathInsideLightRoot(rootPath, resolvedDir)) {
            throw new Error('Directory is outside the configured light mode root');
        }
        let stat: fs.Stats;
        try {
            stat = await fs.promises.stat(resolvedDir);
        } catch {
            throw new Error('Directory not found');
        }
        if (!stat.isDirectory()) {
            throw new Error('Not a directory');
        }
        const kinds = args.kinds ?? 'all';
        const names = await fs.promises.readdir(resolvedDir);
        const directories: FsDirEntry[] = [];
        const allImages: FsDirEntry[] = [];
        // Use stat() per entry (not readdir Dirent) so files are never misclassified on Windows
        // and symlinks resolve to real NEF/JPEG files.
        const statRows = await Promise.all(
            names.map(async (name) => {
                if (name === '.' || name === '..') {
                    return null;
                }
                const full = path.join(resolvedDir, name);
                try {
                    const st = await fs.promises.stat(full);
                    return { name, full, st };
                } catch {
                    return null;
                }
            }),
        );
        for (const row of statRows) {
            if (!row) {
                continue;
            }
            const { name, full, st } = row;
            if (st.isDirectory()) {
                directories.push({ name, path: full });
            } else if (kinds !== 'dirsOnly' && st.isFile()) {
                const ext = path.extname(name).toLowerCase();
                if (FS_IMAGE_EXTENSIONS.has(ext)) {
                    allImages.push({ name, path: full });
                }
            }
        }
        const sortByName = (a: FsDirEntry, b: FsDirEntry) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        directories.sort(sortByName);
        allImages.sort(sortByName);
        const offset = Math.max(0, Number(args.offset) || 0);
        const limit = Math.min(500, Math.max(1, Number(args.limit) || 80));
        const totalImageCount = allImages.length;
        const images = kinds === 'dirsOnly' ? [] : allImages.slice(offset, offset + limit);
        const result: FsReadDirResult = {
            dirPath: resolvedDir,
            directories,
            images,
            totalImageCount,
            rootPath,
        };
        return result;
    }));

    ipcMain.handle('app:set-gallery-mode', wrapIpcHandler(async (_, mode: unknown) => {
        if (mode !== 'db' && mode !== 'folder') {
            throw new Error('Invalid gallery mode');
        }
        appGalleryMode = mode;
        rebuildApplicationMenu();
        return mode;
    }));

    ipcMain.handle('app:get-gallery-mode', () => appGalleryMode);

    ipcMain.handle('fs:select-directory', wrapIpcHandler(async () => {
        const win = getDialogWindow();
        const result = await dialog.showOpenDialog(win || mainWindow!, {
            properties: ['openDirectory'],
            title: 'Choose folder',
        });
        if (result.canceled || !result.filePaths[0]) {
            return null;
        }
        return result.filePaths[0];
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
        const apiConnected = await apiService.isAvailable();
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
                engine: (dbCfg?.engine as string) ?? 'postgres',
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

    ipcMain.handle('api:scoring-fix-image', wrapIpcHandler(async (_, filePath: string) => {
        return await apiService.fixImage(filePath);
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

    // Non-blocking: Postgres/API can take connectionTimeoutMillis (e.g. 10s) when Docker/DB is down.
    // Show the window immediately; the renderer surfaces connection errors via IPC.
    void db.initializeDatabaseProvider().then((ok) => {
        if (!ok) {
            console.warn('[Main] Database provider check failed at startup; UI may show connection errors until DB is reachable.');
        }
    });
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
