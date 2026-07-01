import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import isDev from 'electron-is-dev';
import * as db from './db';
import { nefExtractor } from './nefExtractor';
import { ExifTool } from 'exiftool-vendored';
import { ApiService } from './apiService';
import {
    ExportImageContext,
    type AppConfig,
} from './types';
import { SessionLogManager } from './sessionLogManager';
import { getConfigPath, loadAppConfig } from './config';
import { resolveBackendUiStaticDir, startScoringUiServer, type ScoringUiServer } from './scoringUiServer';
import { UNKNOWN_LENS_FOLDER } from './lensFolderName';
import { cameraFolderFromExifModel } from './cameraFolderName';
import {
    createSyncGuards,
} from './main.handlers';
import { registerDbHandlers } from './ipc/registerDbHandlers';
import { registerBackupHandlers } from './ipc/registerBackupHandlers';
import { registerSyncHandlers } from './ipc/registerSyncHandlers';
import { registerImportHandlers } from './ipc/registerImportHandlers';
import { registerNefFsHandlers } from './ipc/registerNefFsHandlers';
import { registerAppHandlers } from './ipc/registerAppHandlers';
import { registerSystemHandlers } from './ipc/registerSystemHandlers';
import { registerApiHandlers } from './ipc/registerApiHandlers';
import { registerMediaProtocol, registerMediaScheme } from './ipc/registerMediaProtocol';
import { createApplicationMenu } from './menu';
import { exportCurrentImage } from './exportImage';
import {
    startGalleryMcpLiveFromElectron,
    stopGalleryMcpLiveFromElectron,
} from './galleryMcpLive';

/** Placeholder when camera model cannot be derived; sync/backup must not create this folder. */
const UNKNOWN_CAMERA_FOLDER = '_unknown_camera';

function isUnresolvedSyncLayout(camera: string, lens: string): boolean {
    return camera === UNKNOWN_CAMERA_FOLDER || lens === UNKNOWN_LENS_FOLDER;
}

const exiftool = new ExifTool({ maxProcs: 6 });

let mainWindow: BrowserWindow | null = null;
let scoringWindow: BrowserWindow | null = null;
let webuiShellWindow: BrowserWindow | null = null;
let currentExportImageContext: ExportImageContext | null = null;
let sessionLogManager: SessionLogManager | null = null;

let appGalleryMode: 'db' | 'folder' = 'db';
let currentSelectionPath: string | null = null;
let isBackupRunning = false;
const syncGuards = createSyncGuards(() => isBackupRunning);

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

let rebuildApplicationMenu: () => void = () => {};

function setGalleryModeAndNotify(mode: 'db' | 'folder') {
    appGalleryMode = mode;
    rebuildApplicationMenu();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-mode-changed', mode);
    }
}

function initApplicationMenu(): void {
    ({ rebuildApplicationMenu } = createApplicationMenu({
        getMainWindow: () => mainWindow,
        getDialogWindow,
        showMessageBox,
        getGalleryMode: () => appGalleryMode,
        setGalleryMode: setGalleryModeAndNotify,
        syncGuards,
        getIsBackupRunning: () => isBackupRunning,
        getExportContext: () => currentExportImageContext,
        getSelectionPath: () => currentSelectionPath,
        exportCurrentImage: () => exportCurrentImage({
            getMainWindow: () => mainWindow,
            getExportContext: () => currentExportImageContext,
            showSaveDialog,
            exiftool,
        }),
        openScoringWindow,
    }));
}

registerMediaScheme();

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
            webSecurity: true,
        },
        icon: path.join(__dirname, '../public/icon.png'),
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

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
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

    initApplicationMenu();

    registerMediaProtocol({ electronDirname: __dirname, config });

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

    registerImportHandlers({
        ipcMain,
        apiService,
        exiftool,
        getMainWindow: () => mainWindow,
    });

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

    registerNefFsHandlers({
        ipcMain,
        exiftool,
        getMainWindow: () => mainWindow,
        electronDirname: __dirname,
    });

    registerAppHandlers({
        ipcMain,
        getGalleryMode: () => appGalleryMode,
        setGalleryMode: (mode) => { appGalleryMode = mode; },
        getSelectionPath: () => currentSelectionPath,
        setSelectionPath: (p) => { currentSelectionPath = p; },
        getExportContext: () => currentExportImageContext,
        setExportContext: (ctx) => { currentExportImageContext = ctx; },
        rebuildApplicationMenu,
    });

    registerSystemHandlers({
        ipcMain,
        apiService,
        loadConfig,
        electronDirname: __dirname,
        findActiveWebuiPort,
        getScoringWindow: () => scoringWindow,
        getWebuiShellWindow: () => webuiShellWindow,
        getSessionLogManager: () => sessionLogManager,
        setSessionLogManager: (m) => { sessionLogManager = m; },
    });

    registerApiHandlers({
        ipcMain,
        apiService,
        electronDirname: __dirname,
    });

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

    db.closeConnection();

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
