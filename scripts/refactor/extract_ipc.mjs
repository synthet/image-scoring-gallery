/**
 * Batch 1: extract IPC registration blocks from electron/main.ts into electron/ipc/*.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const mainPath = path.join(root, 'electron/main.ts');
const ipcDir = path.join(root, 'electron/ipc');

const lines = fs.readFileSync(mainPath, 'utf8').split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

fs.mkdirSync(ipcDir, { recursive: true });

const wrapBody = slice(401, 421)
  .replace(/^function wrapIpcHandler/, 'export function wrapIpcHandler');
fs.writeFileSync(
  path.join(ipcDir, 'wrapIpcHandler.ts'),
  `/**
 * Wraps an IPC handler to provide consistent error handling.
 * Returns { ok: true, data: T } on success, { ok: false, error: string } on error.
 */
${wrapBody}
`,
);

const dbBody = slice(1002, 1203);
fs.writeFileSync(
  path.join(ipcDir, 'registerDbHandlers.ts'),
  `import type { IpcMain } from 'electron';
import type { ApiService } from '../apiService';
import * as db from '../db';
import { wrapIpcHandler } from './wrapIpcHandler';

export type DbHandlersDeps = {
  ipcMain: IpcMain;
  apiService: ApiService;
};

export function registerDbHandlers(deps: DbHandlersDeps): void {
  const { ipcMain, apiService } = deps;
  let textSearchAbort: AbortController | null = null;

${dbBody.split('\n').map((l) => (l ? '  ' + l : l)).join('\n')}
}
`,
);

const backupBody = slice(1205, 1644);
fs.writeFileSync(
  path.join(ipcDir, 'registerBackupHandlers.ts'),
  `import fs from 'fs';
import path from 'path';
import type { BrowserWindow, IpcMain } from 'electron';
import type { ApiService } from '../apiService';
import { getConfigPath, loadAppConfig } from '../config';
import { buildBackupPlan } from '../backupPipeline';
import { loadBackupConfig, requiresStaleDeleteConfirmation } from '../backupConfig';
import {
  analyzeStaleManifestEntries,
  getVolumeCapacityBytes,
  getVolumeFreeBytes,
  selectPlanProportional,
  syncStaleBackupEntries,
  xmpSidecarPath,
} from '../backupSpace';
import { toWindowsLocalFsPath } from '../pathWinWsl';
import { normalizeLensFolderName } from '../lensFolderName';
import type {
  BackupManifest,
  BackupManifestEntry,
  BackupPreviewInfo,
  BackupProgress,
  BackupResult,
  BackupRunOptions,
  BackupTargetInfo,
} from '../types';
import * as db from '../db';
import { wrapIpcHandler } from './wrapIpcHandler';
import type { SyncGuards } from '../main.handlers';

export type BackupHandlersDeps = {
  ipcMain: IpcMain;
  syncGuards: SyncGuards;
  getMainWindow: () => BrowserWindow | null;
  getIsBackupRunning: () => boolean;
  setIsBackupRunning: (v: boolean) => void;
  rebuildApplicationMenu: () => void;
  electronDirname: string;
  normalizeCameraModel: (raw: string | undefined | null) => string;
  isUnresolvedSyncLayout: (camera: string, lens: string) => boolean;
};

export function registerBackupHandlers(deps: BackupHandlersDeps): void {
  const {
    ipcMain,
    getMainWindow,
    syncGuards,
    getIsBackupRunning,
    setIsBackupRunning,
    rebuildApplicationMenu,
    electronDirname,
    normalizeCameraModel,
    isUnresolvedSyncLayout,
  } = deps;
  const mainWindow = getMainWindow();

${backupBody
  .replace(/\b__dirname\b/g, 'electronDirname')
  .replace(/\bisBackupRunning\b/g, 'getIsBackupRunning()')
  .replace(/getIsBackupRunning\(\) = true/g, 'setIsBackupRunning(true)')
  .replace(/getIsBackupRunning\(\) = false/g, 'setIsBackupRunning(false)')
  .split('\n')
  .map((l) => (l ? '  ' + l : l))
  .join('\n')}
}
`,
);

const syncBody = slice(1761, 2333);
fs.writeFileSync(
  path.join(ipcDir, 'registerSyncHandlers.ts'),
  `import fs from 'fs';
import path from 'path';
import type { BrowserWindow, IpcMain } from 'electron';
import type { ApiService } from '../apiService';
import { ExifTool } from 'exiftool-vendored';
import { cameraFolderFromExifModel } from '../cameraFolderName';
import { normalizeLensFolderName, UNKNOWN_LENS_FOLDER } from '../lensFolderName';
import { UNKNOWN_CAMERA_FOLDER } from '../cameraFolderName';
import type {
  SyncCandidate,
  SyncPreviewResult,
  SyncRunResult,
} from '../types';
import * as db from '../db';
import { wrapIpcHandler } from './wrapIpcHandler';
import { assertSyncPreviewAllowed, assertSyncRunAllowed, type SyncGuards } from '../main.handlers';
import type { AppConfig } from '../types';
import {
  scheduleProcessingForImages,
  type ScheduleResult,
} from '../scheduleProcessing';

export type SyncHandlersDeps = {
  ipcMain: IpcMain;
  exiftool: ExifTool;
  apiService: ApiService;
  loadConfig: () => AppConfig;
  getMainWindow: () => BrowserWindow | null;
  syncGuards: SyncGuards;
  rebuildApplicationMenu: () => void;
  isUnresolvedSyncLayout: (camera: string, lens: string) => boolean;
};

export function registerSyncHandlers(deps: SyncHandlersDeps): void {
  const {
    ipcMain,
    exiftool,
    apiService,
    loadConfig,
    getMainWindow,
    syncGuards,
    rebuildApplicationMenu,
    isUnresolvedSyncLayout,
  } = deps;
  const mainWindow = getMainWindow();

${syncBody.split('\n').map((l) => (l ? '  ' + l : l)).join('\n')}
}
`,
);

// Rebuild main.ts: remove extracted blocks, insert register calls
const newMain = [];
let i = 0;
const lineNo = () => i + 1;

while (i < lines.length) {
  const n = lineNo();
  if (n === 401) {
    // skip wrapIpcHandler comment + function (401-421)
    i = 421;
    continue;
  }
  if (n === 1002) {
    newMain.push('    registerDbHandlers({ ipcMain, apiService });');
    newMain.push('');
    i = 1203;
    continue;
  }
  if (n === 1205) {
    newMain.push('    registerBackupHandlers({');
    newMain.push('      ipcMain,');
    newMain.push('      getMainWindow: () => mainWindow,');
    newMain.push('      syncGuards,');
    newMain.push('      getIsBackupRunning: () => isBackupRunning,');
    newMain.push('      setIsBackupRunning: (v) => { isBackupRunning = v; },');
    newMain.push('      rebuildApplicationMenu,');
    newMain.push('      electronDirname: __dirname,');
    newMain.push('      normalizeCameraModel: (raw) => {');
    newMain.push("        const seg = cameraFolderFromExifModel(raw ?? undefined);");
    newMain.push("        return seg === 'unknown' ? UNKNOWN_CAMERA_FOLDER : seg;");
    newMain.push('      },');
    newMain.push('      isUnresolvedSyncLayout,');
    newMain.push('    });');
    newMain.push('');
    i = 1644;
    continue;
  }
  if (n === 1761) {
    newMain.push('    registerSyncHandlers({');
    newMain.push('      ipcMain,');
    newMain.push('      exiftool,');
    newMain.push('      apiService,');
    newMain.push('      loadConfig,');
    newMain.push('      getMainWindow: () => mainWindow,');
    newMain.push('      syncGuards,');
    newMain.push('      rebuildApplicationMenu,');
    newMain.push('      isUnresolvedSyncLayout,');
    newMain.push('    });');
    newMain.push('');
    i = 2333;
    continue;
  }
  newMain.push(lines[i]);
  i++;
}

// Add imports after main.handlers import block
const importBlock = `import { wrapIpcHandler } from './ipc/wrapIpcHandler';
import { registerDbHandlers } from './ipc/registerDbHandlers';
import { registerBackupHandlers } from './ipc/registerBackupHandlers';
import { registerSyncHandlers } from './ipc/registerSyncHandlers';
`;

let out = newMain.join('\n');
if (!out.includes("from './ipc/wrapIpcHandler'")) {
  out = out.replace(
    "from './main.handlers';",
    "from './main.handlers';\n" + importBlock,
  );
}

fs.writeFileSync(mainPath, out);
console.log('IPC extraction complete. main.ts lines:', out.split('\n').length);
