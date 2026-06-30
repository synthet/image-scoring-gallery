import type { BrowserWindow, IpcMain } from 'electron';
import type { ExifTool } from 'exiftool-vendored';
import type { ApiService } from '../apiService';
import type { AppConfig } from '../types';
import type { SyncGuards } from '../main.handlers';
import type { wrapIpcHandler } from './wrapIpcHandler';

/** Shared dependencies passed into IPC registrar functions from `startFullApplication`. */
export type IpcRegistrarContext = {
  ipcMain: IpcMain;
  apiService: ApiService;
  exiftool: ExifTool;
  loadConfig: () => AppConfig;
  getMainWindow: () => BrowserWindow | null;
  syncGuards: SyncGuards;
  rebuildApplicationMenu: () => void;
  electronDirname: string;
  wrapIpcHandler: typeof wrapIpcHandler;
  getIsBackupRunning: () => boolean;
  setIsBackupRunning: (v: boolean) => void;
  normalizeCameraModel: (raw: string | undefined | null) => string;
  isUnresolvedSyncLayout: (camera: string, lens: string) => boolean;
};
