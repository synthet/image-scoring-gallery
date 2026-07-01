import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, shell } from 'electron';
import type { BrowserWindow, IpcMain } from 'electron';
import type { ApiService } from '../apiService';
import type { AppConfig } from '../types';
import * as db from '../db';
import { getConfigPath } from '../config';
import { loadSystemConfig, saveSystemConfig } from '../main.handlers';
import { SessionLogManager } from '../sessionLogManager';
import { wrapIpcHandler } from './wrapIpcHandler';

export type SystemHandlersDeps = {
    ipcMain: IpcMain;
    apiService: ApiService;
    loadConfig: () => AppConfig;
    electronDirname: string;
    findActiveWebuiPort: () => Promise<number | null>;
    getScoringWindow: () => BrowserWindow | null;
    getWebuiShellWindow: () => BrowserWindow | null;
    getSessionLogManager: () => SessionLogManager | null;
    setSessionLogManager: (manager: SessionLogManager | null) => void;
};

export function registerSystemHandlers(deps: SystemHandlersDeps): void {
    const {
        ipcMain,
        apiService,
        loadConfig,
        electronDirname,
        findActiveWebuiPort,
        getScoringWindow,
        getWebuiShellWindow,
        getSessionLogManager,
        setSessionLogManager,
    } = deps;

    ipcMain.handle('debug:log', async (_, { level, message, data, timestamp }) => {
        const logDir = app.getPath('userData');

        let sessionLogManager = getSessionLogManager();
        if (!sessionLogManager) {
            sessionLogManager = new SessionLogManager(logDir);
            setSessionLogManager(sessionLogManager);
        }

        const logFile = await sessionLogManager.getWritableLogPath(new Date());

        const logEntry = JSON.stringify({
            timestamp,
            level,
            message,
            data,
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
        const scoringWindow = getScoringWindow();
        const webuiShellWindow = getWebuiShellWindow();
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
            configPath: getConfigPath(electronDirname),
            updates,
            readFile: fs.promises.readFile,
            writeFile: (p, d) => fs.promises.writeFile(p, d),
            existsSync: fs.existsSync,
        }),
    ));
}
