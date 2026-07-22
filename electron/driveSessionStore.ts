/**
 * Federated per-drive session store. Remembers, keyed by a stable drive id
 * (see `driveIdentity.ts`), what Sync/Backup learned about a drive so later
 * sessions can skip redundant work.
 *
 * Design: several {@link LayerAdapter}s (local userData cache now; on-drive
 * sidecar and backend API later) behind one facade.
 *  - read  = read every reachable layer, reconcile newest-`updatedAt`-wins and
 *            union the `seen` map; missing/failing layers are non-fatal.
 *  - write = stamp `updatedAt` and write-through to every reachable layer; a
 *            failed layer is logged and skipped, never blocking sync/backup.
 *
 * The `sync.seen` map caches EXIF-derived facts per source file so a repeat
 * scan can skip the (expensive) `exiftool.read`. It is keyed by
 * `relPath|size|mtimeMs`, so any change to a file's bytes invalidates its entry.
 */

import fs from 'node:fs';
import path from 'node:path';

/** EXIF-derived facts cached per source file to avoid re-reading EXIF. */
export interface SyncSeenEntry {
    dateStr: string;
    camera: string;
    lens: string;
    imageUuid: string | null;
}

export interface DriveSession {
    driveId: string;
    label?: string;
    /** ISO timestamp; drives newest-wins reconciliation. */
    updatedAt: string;
    sync?: {
        lastSourceRoot: string;
        lastSyncAt?: string;
        lastWatermark?: string | null;
        /** key = `relPath|size|mtimeMs` → derived EXIF facts. */
        seen: Record<string, SyncSeenEntry>;
    };
    backup?: {
        lastTargetRoot: string;
        lastBackupAt: string;
    };
}

export interface LayerAdapter {
    readonly name: string;
    read(driveId: string): Promise<DriveSession | null>;
    write(driveId: string, session: DriveSession): Promise<void>;
}

export interface DriveSessionStore {
    read(driveId: string): Promise<DriveSession | null>;
    /** Stamps `updatedAt`, writes through all layers, returns the stamped record. */
    write(session: DriveSession): Promise<DriveSession>;
}

/**
 * Pure reconciliation: pick the newest record as the base, then union every
 * layer's `seen` map (newest record wins on key conflict).
 */
export function reconcileSessions(sessions: ReadonlyArray<DriveSession | null>): DriveSession | null {
    const present = sessions.filter((s): s is DriveSession => s != null);
    if (present.length === 0) return null;

    // Newest first (descending updatedAt; stable for equal timestamps).
    const byNewest = [...present].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    const base = byNewest[0];

    const seen: Record<string, SyncSeenEntry> = {};
    // Apply oldest → newest so newer entries overwrite on conflict.
    for (const s of [...byNewest].reverse()) {
        if (s.sync?.seen) Object.assign(seen, s.sync.seen);
    }

    const merged: DriveSession = { ...base };
    if (base.sync || Object.keys(seen).length > 0) {
        merged.sync = { ...(base.sync ?? { lastSourceRoot: '' }), seen };
    }
    return merged;
}

/** Build a store over the given layers (dependency-injected for tests). */
export function createDriveSessionStore(layers: ReadonlyArray<LayerAdapter>): DriveSessionStore {
    async function read(driveId: string): Promise<DriveSession | null> {
        const results = await Promise.all(
            layers.map((l) =>
                l.read(driveId).catch((err) => {
                    console.warn(`[DriveSession] layer '${l.name}' read failed:`, err);
                    return null;
                }),
            ),
        );
        return reconcileSessions(results);
    }

    async function write(session: DriveSession): Promise<DriveSession> {
        const stamped: DriveSession = { ...session, updatedAt: new Date().toISOString() };
        await Promise.all(
            layers.map((l) =>
                l.write(stamped.driveId, stamped).catch((err) => {
                    console.warn(`[DriveSession] layer '${l.name}' write failed:`, err);
                }),
            ),
        );
        return stamped;
    }

    return { read, write };
}

/**
 * Local layer: a single JSON file (`driveId → DriveSession`) in userData.
 * Always available; the fast cache. Writes are atomic (tmp + rename).
 */
export function createLocalFileLayer(filePath: string): LayerAdapter {
    async function loadAll(): Promise<Record<string, DriveSession>> {
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, DriveSession>) : {};
        } catch {
            return {};
        }
    }

    return {
        name: 'local',
        async read(driveId) {
            const all = await loadAll();
            return all[driveId] ?? null;
        },
        async write(driveId, session) {
            const all = await loadAll();
            all[driveId] = session;
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            const tmp = `${filePath}.tmp`;
            await fs.promises.writeFile(tmp, JSON.stringify(all, null, 2), 'utf8');
            await fs.promises.rename(tmp, filePath);
        },
    };
}

let defaultStore: DriveSessionStore | null = null;

/**
 * Process-wide default store (local layer only for now). `userDataDir` is passed
 * in by the main process (`app.getPath('userData')`) so this module stays free of
 * any Electron import and its pure helpers remain unit-testable.
 */
export function getDriveSessionStore(userDataDir: string): DriveSessionStore {
    if (defaultStore) return defaultStore;
    const file = path.join(userDataDir, 'drive-sessions.json');
    defaultStore = createDriveSessionStore([createLocalFileLayer(file)]);
    return defaultStore;
}
