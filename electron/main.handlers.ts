import fs from 'fs';
import path from 'path';
import { deepMergeConfig, normalizeAppConfig } from './config';

export type SyncGuards = {
  isBackupRunning: () => boolean;
  isSyncRunInProgress: () => boolean;
  activeSyncPreviewCount: () => number;
  setSyncRunInProgress: (value: boolean) => void;
  incrementPreviewCount: () => void;
  decrementPreviewCount: () => void;
};

export function createSyncGuards(isBackupRunningRef: () => boolean): SyncGuards {
  let syncRun = false;
  let previewCount = 0;
  return {
    isBackupRunning: isBackupRunningRef,
    isSyncRunInProgress: () => syncRun,
    activeSyncPreviewCount: () => previewCount,
    setSyncRunInProgress: (value) => {
      syncRun = value;
    },
    incrementPreviewCount: () => {
      previewCount += 1;
    },
    decrementPreviewCount: () => {
      previewCount = Math.max(0, previewCount - 1);
    },
  };
}

export function assertSyncPreviewAllowed(guards: SyncGuards): void {
  if (guards.isBackupRunning()) {
    throw new Error('Backup is running. Finish backup before sync.');
  }
  if (guards.isSyncRunInProgress()) {
    throw new Error('A full sync is already in progress. Finish it before previewing.');
  }
}

export function assertSyncRunAllowed(guards: SyncGuards): void {
  if (guards.isBackupRunning()) {
    throw new Error('Backup is running. Finish backup before sync.');
  }
  if (guards.isSyncRunInProgress()) {
    throw new Error('Another sync operation is already in progress.');
  }
  if (guards.activeSyncPreviewCount() > 0) {
    throw new Error('Sync preview is still running. Wait for it to finish before starting sync.');
  }
}

export async function loadSystemConfig(loadConfig: () => unknown): Promise<unknown> {
  return loadConfig();
}

export async function saveSystemConfig(
  options: {
    configPath: string;
    updates: unknown;
    readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
    existsSync: (path: string) => boolean;
  }
): Promise<unknown> {
  const { configPath, updates, readFile, writeFile, existsSync } = options;

  let currentConfig: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    currentConfig = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  }

  const updatesObj = typeof updates === 'object' && updates !== null
    ? updates as Record<string, unknown>
    : {};

  const mergedConfig = deepMergeConfig(currentConfig, updatesObj);
  const newConfig = normalizeAppConfig(mergedConfig);
  await writeFile(configPath, JSON.stringify(newConfig, null, 2));
  return newConfig;
}

export async function extractNefPreviewEnvelope(
  filePath: string,
  deps: {
    platform: NodeJS.Platform;
    readFile: (path: string) => Promise<Buffer>;
    extractPreview: (path: string) => Promise<Buffer | null>;
    extname?: (path: string) => string;
  }
): Promise<{ success: boolean; fallback?: boolean; buffer: Buffer }> {
  let convertedPath = filePath;
  if (deps.platform === 'win32' && filePath.match(/^\/mnt\/[a-zA-Z]\//)) {
    convertedPath = filePath.replace(/^\/mnt\/([a-zA-Z])\//, '$1:/');
  }

  const ext = (deps.extname ?? path.extname)(convertedPath).toLowerCase();
  if (ext !== '.nef') {
    return {
      success: false,
      fallback: true,
      buffer: await deps.readFile(convertedPath),
    };
  }

  const extracted = await deps.extractPreview(convertedPath);
  if (extracted) {
    return { success: true, buffer: extracted };
  }

  return {
    success: false,
    fallback: true,
    buffer: await deps.readFile(convertedPath),
  };
}

export const mainHandlerFs = {
  readFile: (filePath: string) => fs.promises.readFile(filePath),
};
