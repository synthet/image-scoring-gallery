import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_LOG_POLICY, SessionLogManager, type SessionLogPolicy } from './sessionLogManager';

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-log-manager-'));
  tempDirs.push(dir);
  return dir;
}

async function writeSizedFile(filePath: string, sizeInBytes: number) {
  await fs.promises.writeFile(filePath, Buffer.alloc(sizeInBytes, 'x'));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.promises.rm(dir, { recursive: true, force: true })));
});

describe('SessionLogManager', () => {
  it('uses base session log file until max size is reached, then rotates', async () => {
    const logDir = createTempDir();
    const policy: SessionLogPolicy = {
      ...DEFAULT_SESSION_LOG_POLICY,
      maxBytesPerFile: 50,
      cleanupIntervalMs: Number.MAX_SAFE_INTEGER,
    };

    const manager = new SessionLogManager(logDir, policy);
    const now = new Date('2026-03-15T12:00:00.000Z');

    const firstPath = await manager.getWritableLogPath(now);
    expect(path.basename(firstPath)).toBe('session_2026-03-15.log');

    await writeSizedFile(firstPath, 50);

    const rotatedPath = await manager.getWritableLogPath(now);
    expect(path.basename(rotatedPath)).toBe('session_2026-03-15.1.log');
  });

  it('removes logs older than retention policy', async () => {
    const logDir = createTempDir();
    const manager = new SessionLogManager(logDir, {
      ...DEFAULT_SESSION_LOG_POLICY,
      retentionDays: 14,
      cleanupIntervalMs: 0,
    });

    await fs.promises.mkdir(logDir, { recursive: true });
    await writeSizedFile(path.join(logDir, 'session_2026-02-25.log'), 10);
    await writeSizedFile(path.join(logDir, 'session_2026-03-14.log'), 10);

    await manager.cleanupOldLogs(new Date('2026-03-15T00:00:00.000Z'));

    const files = await fs.promises.readdir(logDir);
    expect(files).toEqual(['session_2026-03-14.log']);
  });

  it('enforces maxFiles by removing oldest remaining logs', async () => {
    const logDir = createTempDir();
    const manager = new SessionLogManager(logDir, {
      ...DEFAULT_SESSION_LOG_POLICY,
      retentionDays: 365,
      maxFiles: 3,
      cleanupIntervalMs: 0,
    });

    await fs.promises.mkdir(logDir, { recursive: true });
    await writeSizedFile(path.join(logDir, 'session_2026-03-10.log'), 10);
    await writeSizedFile(path.join(logDir, 'session_2026-03-11.log'), 10);
    await writeSizedFile(path.join(logDir, 'session_2026-03-12.log'), 10);
    await writeSizedFile(path.join(logDir, 'session_2026-03-13.log'), 10);

    await manager.cleanupOldLogs(new Date('2026-03-15T00:00:00.000Z'));

    const files = (await fs.promises.readdir(logDir)).sort();
    expect(files).toEqual([
      'session_2026-03-11.log',
      'session_2026-03-12.log',
      'session_2026-03-13.log',
    ]);
  });
});
