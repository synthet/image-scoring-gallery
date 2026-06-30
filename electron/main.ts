import { app, BrowserWindow, ipcMain, protocol, net, Menu, dialog, shell } from 'electron';
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
    type AppConfig,
    type FileImageMetadataDetail,
    type FileImageMetadataResult,
    type FsDirEntry,
    type FsReadDirResult,
} from './types';
import { SessionLogManager } from './sessionLogManager';
import { getConfigPath, loadAppConfig } from './config';
import { resolveSortOptions } from './scoringModels';
import { resolveBackendUiStaticDir, startScoringUiServer, type ScoringUiServer } from './scoringUiServer';
import { UNKNOWN_LENS_FOLDER } from './lensFolderName';
import { cameraFolderFromExifModel } from './cameraFolderName';
import { parseMediaUrlToFilePath } from './mediaUrlParse';
import { collapseMalformedThumbnailSegments, absolutizeThumbnailPath } from './thumbnailPathNormalize';
import {
    createSyncGuards,
    extractNefPreviewEnvelope,
    loadSystemConfig,
    mainHandlerFs,
    saveSystemConfig,
} from './main.handlers';
import { wrapIpcHandler } from './ipc/wrapIpcHandler';
import { registerDbHandlers } from './ipc/registerDbHandlers';
import { registerBackupHandlers } from './ipc/registerBackupHandlers';
import { registerSyncHandlers } from './ipc/registerSyncHandlers';

import {
    scheduleProcessingForImages,
    scheduleProcessingForImportedFolder,
} from './scheduleProcessing';
import {
    startGalleryMcpLiveFromElectron,
    stopGalleryMcpLiveFromElectron,
} from './galleryMcpLive';

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

/**
 * Re-encoded export JPEGs often still carry EXIF Orientation from the embedded preview
 * (Chromium canvas may copy it). Pixels are already upright after the renderer bake, so
 * Orientation must be 1 or viewers (e.g. Windows Photos) rotate again.
 *
 * @see docs/features/implemented/05-jpeg-export-exif-orientation.md
 */
async function resetExportedJpegExifOrientation(targetPath: string, mimeType: string): Promise<void> {
    const lower = targetPath.toLowerCase();
    const isJpeg =
        mimeType.includes('jpeg') ||
        mimeType.includes('jpg') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg');
    if (!isJpeg) {
        return;
    }
    try {
        await exiftool.write(
            targetPath,
            { Orientation: 1 },
            {
                writeArgs: ['-overwrite_original', '-n'],
                useMWG: false,
                ignoreMinorErrors: true,
            },
        );
    } catch (err) {
        console.warn('[Main] Export: could not reset EXIF Orientation to 1 (non-fatal)', err);
    }
}

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
let currentSelectionPath: string | null = null;
let isBackupRunning = false;
const syncGuards = createSyncGuards(() => isBackupRunning);

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
    await resetExportedJpegExifOrientation(targetPath, currentExportImageContext.mimeType);

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

            // Read tags from the written export first (embedded preview EXIF must match pixels),
            // then from the source file for everything else.
            const targetTags = await exiftool.read(targetPath);
            const sourceTags = await exiftool.read(sourcePath);
            const tagsToCopy: Record<string, unknown> = {};

            const preserveTags = [
                'Make', 'Model', 'LensModel', 'ISO', 'ExposureTime', 'FNumber',
                'FocalLength', 'DateTimeOriginal', 'CreateDate', 'GPSLatitude',
                'GPSLongitude', 'GPSAltitude'
            ] as const;

            const normalized = currentExportImageContext.pixelNormalizationApplied === true;
            const p = currentExportImageContext.previewOrientation;
            const s = sourceTags.Orientation;

            // Strict normalization logic:
            // 1. We ALWAYS write with Orientation 1 because the binary pixels
            //    were already normalized in the renderer's export bake.
            tagsToCopy.Orientation = 1;

            // 2. We must ensure no other conflicting rotation metadata is copied
            //    from the source file (EXIF, XMP, specific markers).
            const orientationTagsToStrip = [
                'Orientation', 'Rotation', 'AutoRotate', 'CameraOrientation',
                'ImageOrientation', 'XMP-tiff:Orientation', 'XMP-exif:Orientation'
            ];

            // Filter preserveTags and explicitly strip source orientation tags
            for (const tag of preserveTags) {
                if (sourceTags[tag as keyof typeof sourceTags] !== undefined) {
                    tagsToCopy[tag] = sourceTags[tag as keyof typeof sourceTags];
                }
            }

            // Sanitization: Ensure NO orientation tags exist remaining
            for (const tag of orientationTagsToStrip) {
                delete (tagsToCopy as any)[tag];
            }
            tagsToCopy.Orientation = 1; // Explicitly set again to be sure

            // Consolidated diagnostic log
            console.log(`[Main] Export: ${path.basename(sourcePath)} | PrevOrient: ${p ?? 'None'} | RawOrient: ${s ?? 'None'} | Normalized: ${normalized} | Size: ${targetTags.ImageWidth}x${targetTags.ImageHeight} | Final: 1`);

            // Add our custom description
            tagsToCopy.ImageDescription = metadata;
            tagsToCopy.Description = metadata; // XMP
            tagsToCopy.XPComment = metadata;    // Windows
            tagsToCopy.UserComment = metadata;

            console.log(`[Main] Writing enriched metadata to ${targetPath}`);
            await exiftool.write(targetPath, tagsToCopy, {
                writeArgs: ['-overwrite_original', '-n'],
                useMWG: false,
                ignoreMinorErrors: true,
            });
        } else {
            // Just write our metadata if source is missing
            await exiftool.write(
                targetPath,
                {
                    ImageDescription: metadata,
                    Description: metadata,
                    XPComment: metadata,
                    UserComment: metadata,
                    Orientation: 1,
                },
                {
                    writeArgs: ['-overwrite_original', '-n'],
                    useMWG: false,
                    ignoreMinorErrors: true,
                },
            );
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
                    enabled: !folderMode && !syncGuards.isSyncRunInProgress() && syncGuards.activeSyncPreviewCount() === 0 && !isBackupRunning,
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
                    enabled: !folderMode && !isBackupRunning && !syncGuards.isSyncRunInProgress() && syncGuards.activeSyncPreviewCount() === 0,
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
                {
                    label: 'Reveal in Explorer',
                    enabled: !!currentSelectionPath || !!currentExportImageContext?.sourcePath,
                    click: () => {
                        const pathToReveal = currentSelectionPath || currentExportImageContext?.sourcePath;
                        if (pathToReveal) {
                            shell.showItemInFolder(pathToReveal);
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
                    label: 'Search',
                    enabled: !folderMode,
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-search');
                        }
                    },
                },
                {
                    label: 'Keywords',
                    enabled: !folderMode,
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-keywords');
                        }
                    },
                },
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
function loadConfig(): AppConfig {
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
        scoringWindow = new BrowserWindow({
            width: 1280,
            height: 900,
            title: 'Vexlum Scoring',
            ...(backendIcon ? { icon: backendIcon } : {}),
            webPreferences: { contextIsolation: true },
        });
        scoringWindow.setMenu(null);
        scoringWindow.on('closed', () => {
            scoringWindow = null;
        });

        try {
            const local = await ensureScoringUiServer();
            const url = local ? `${local.baseUrl}/ui/runs` : `${apiService.getBaseUrl()}/ui/runs`;
            await scoringWindow.loadURL(url);
        } catch (e) {
            console.error('[Main] Failed to load Scoring UI:', e);
            try {
                if (scoringWindow && !scoringWindow.isDestroyed()) {
                    await scoringWindow.loadURL(`${apiService.getBaseUrl()}/ui/runs`);
                }
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
        title: 'Vexlum Scoring WebUI',
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
    registerDbHandlers({ ipcMain, apiService });


    registerBackupHandlers({
      ipcMain,
      getMainWindow: () => mainWindow,
      syncGuards,
      getIsBackupRunning: () => isBackupRunning,
      setIsBackupRunning: (v) => { isBackupRunning = v; },
      rebuildApplicationMenu,
      electronDirname: __dirname,
      normalizeCameraModel: (raw) => {
        const seg = cameraFolderFromExifModel(raw ?? undefined);
        return seg === 'unknown' ? UNKNOWN_CAMERA_FOLDER : seg;
      },
      isUnresolvedSyncLayout,
    });


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
                const processing = await scheduleProcessingForImportedFolder(apiService, folderPath, added);
                if (processing.method !== 'none') {
                    console.log('[Main] Import (API) schedule:', folderPath, processing);
                }
                return { added, skipped, errors: errs, processing };
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
            .filter(p => FS_IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase()));

        const total = files.length;
        let added = 0;
        let skipped = 0;
        const errors: string[] = [];

        const folderId = await db.getOrCreateFolder(folderPath);
        const newImageIds: number[] = [];

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
                newImageIds.push(newImageId);
                added++;
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                errors.push(`${fileName}: ${msg}`);
            }
        }

        const processing = await scheduleProcessingForImages(apiService, {
            folderPath,
            imageIds: newImageIds,
        });
        if (processing.method !== 'none') {
            console.log('[Main] Import (direct DB) schedule:', folderPath, newImageIds.length, processing);
        }
        return { added, skipped, errors, processing };
    }));

    // ── Sync: copy new photos from external source into structured local tree, then import ──

    registerSyncHandlers({
      ipcMain,
      exiftool,
      apiService,
      loadConfig,
      getMainWindow: () => mainWindow,
      syncGuards,
      rebuildApplicationMenu,
      isUnresolvedSyncLayout,
    });


    ipcMain.handle('nef:extract-preview', wrapIpcHandler(async (_, filePath: string) => {
        console.log(`[Main] NEF preview requested for: ${filePath}`);
        return await extractNefPreviewEnvelope(filePath, {
            platform: process.platform,
            readFile: mainHandlerFs.readFile,
            extractPreview: (p) => nefExtractor.extractPreview(p),
        });
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

    ipcMain.handle('app:set-selection-path', async (_, filePath: string | null) => {
        currentSelectionPath = filePath;
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
            if (config.api.url) {
                const url = config.api.url.replace(/\/$/, '');
                const browserRaw = config.api.browserUrl?.trim();
                const browserUrl = browserRaw ? browserRaw.replace(/\/$/, '') : undefined;
                return browserUrl ? { url, browserUrl } : { url };
            }
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

    ipcMain.handle('system:open-external-url', wrapIpcHandler(async (_, url: string) => {
        const { shell } = await import('electron');
        
        // Re-use existing scoring or webui shell window if available
        const targetWin = (scoringWindow && !scoringWindow.isDestroyed()) ? scoringWindow : 
                         (webuiShellWindow && !webuiShellWindow.isDestroyed()) ? webuiShellWindow : null;

        if (targetWin) {
            console.log(`[Main] Navigating existing window to: ${url}`);
            await targetWin.loadURL(url);
            targetWin.focus();
            return;
        }

        console.log(`[Main] Opening external URL: ${url}`);
        await shell.openExternal(url);
    }));

    ipcMain.handle('system:get-config', wrapIpcHandler(async () => loadSystemConfig(loadConfig)));

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

    ipcMain.handle('system:save-config', wrapIpcHandler(async (_, updates) =>
        saveSystemConfig({
            configPath: getConfigPath(__dirname),
            updates,
            readFile: fs.promises.readFile,
            writeFile: (p, d) => fs.promises.writeFile(p, d),
            existsSync: fs.existsSync,
        }),
    ));

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

    ipcMain.handle('api:get-scoring-sort-options', wrapIpcHandler(async () => {
        return await resolveSortOptions(apiService, path.resolve(__dirname, '..'));
    }));

    ipcMain.handle('api:get-stack-analytics', wrapIpcHandler(async (_, stackId: number) => {
        return await apiService.getStackAnalytics(stackId);
    }));

    ipcMain.handle('api:get-agent-cull-groups', wrapIpcHandler(async (_, params?: {
        stackId?: number;
        subStackId?: number;
        status?: string;
        limit?: number;
        offset?: number;
    }) => {
        return await apiService.getAgentCullGroups(params);
    }));

    ipcMain.handle('api:get-agent-cull-group', wrapIpcHandler(async (_, groupId: number) => {
        return await apiService.getAgentCullGroup(groupId);
    }));

    ipcMain.handle('api:run-agent-cull-review', wrapIpcHandler(async (_, body: {
        stackId: number;
        subStackId?: number | null;
        dryRun?: boolean;
        force?: boolean;
        agent?: string;
    }) => {
        return await apiService.runAgentCullReview(body);
    }));

    ipcMain.handle('api:apply-agent-cull-candidates', wrapIpcHandler(async (_, groupId: number, body?: {
        recommendationIds?: number[];
        actor?: string;
        note?: string;
    }) => {
        return await apiService.applyAgentCullCandidates(groupId, body);
    }));

    ipcMain.handle('api:delete-approved-agent-cull', wrapIpcHandler(async (_, groupId: number, body: {
        confirm: boolean;
        actor?: string;
    }) => {
        return await apiService.deleteApprovedAgentCullCandidates(groupId, body);
    }));

    ipcMain.handle('api:approve-agent-cull-group', wrapIpcHandler(async (_, groupId: number, body?: {
        recommendationIds?: number[];
        actor?: string;
        note?: string;
    }) => {
        return await apiService.approveAgentCullGroup(groupId, body);
    }));

    ipcMain.handle('api:reject-agent-cull-group', wrapIpcHandler(async (_, groupId: number, body?: {
        recommendationIds?: number[];
        actor?: string;
        note?: string;
    }) => {
        return await apiService.rejectAgentCullGroup(groupId, body);
    }));

    ipcMain.handle('api:rollback-agent-cull-recommendation', wrapIpcHandler(async (_, recommendationId: number, body?: {
        actor?: string;
        note?: string;
    }) => {
        return await apiService.rollbackAgentCullRecommendation(recommendationId, body);
    }));

    ipcMain.handle('api:update-image-pick-status', wrapIpcHandler(async (_, imageId: number, pickStatus: -1 | 0 | 1) => {
        return await apiService.updateImagePickStatus(imageId, pickStatus);
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

    void startGalleryMcpLiveFromElectron({
        projectRoot: path.join(__dirname, '..'),
        getWindowStatus: async () => ({
            hasMainWindow: mainWindow !== null && !mainWindow.isDestroyed(),
            visible: mainWindow?.isVisible() ?? false,
            focused: mainWindow?.isFocused() ?? false,
            bounds: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null,
        }),
    }).catch((err) => {
        console.warn('[Main] is-ui-live MCP failed to start:', err);
    });

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
    await stopGalleryMcpLiveFromElectron();

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
