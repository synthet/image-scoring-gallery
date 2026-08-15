import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: { getPath: () => '/tmp/userData' },
    BrowserWindow: class {},
    dialog: {},
    ipcMain: { handle: vi.fn() },
}));

import { manifestTrackedIds } from './registerBackupHandlers';
import type { BackupManifest } from '../types';

const mk = (rows: Array<[number, string]>): BackupManifest => ({
    updatedAt: '2026-07-29T00:00:00.000Z',
    images: rows.map(([id, relPath]) => ({ id, relPath, score: 0.9, size: 100, hash: '' })),
});

/**
 * Guards the budget estimator's notion of "already at destination".
 *
 * The previous heuristic matched on filename, which collides across cameras and dates: on a
 * live run it reported 45,339 candidates present against a destination holding only 31,746
 * files. That number feeds roughFillRatio -> maxPerCluster, so it must be exact.
 */
describe('manifestTrackedIds', () => {
    it('returns ids the manifest actually tracks', () => {
        const ids = manifestTrackedIds(mk([
            [101, 'Z8\\180-600mm\\2026\\2026-01-01\\a.NEF'],
            [102, 'Z8\\180-600mm\\2026\\2026-01-01\\b.NEF'],
        ]));
        expect([...ids].sort((a, b) => a - b)).toEqual([101, 102]);
    });

    it('excludes adopted rows (id 0), which are untracked files not budget candidates', () => {
        const ids = manifestTrackedIds(mk([
            [101, 'Z8\\180-600mm\\2026\\2026-01-01\\a.NEF'],
            [0, 'Z8\\180-600mm\\2026\\2026-01-01\\orphan1.NEF'],
            [0, 'D90\\35mm\\2015\\2015-01-01\\orphan2.NEF'],
            [102, 'D90\\35mm\\2015\\2015-01-01\\b.NEF'],
        ]));
        expect(ids.has(0)).toBe(false);
        expect(ids.size).toBe(2);
    });

    it('never exceeds the manifest row count (the old heuristic could)', () => {
        // Same basename under different cameras/dates — the collision the old code hit.
        const manifest = mk([
            [1, 'Z8\\180-600mm\\2026\\2026-01-01\\DSC_1234.NEF'],
            [2, 'D90\\35mm\\2015\\2015-06-02\\DSC_1234.NEF'],
            [3, 'Z6ii\\28-400mm\\2025\\2025-07-31\\DSC_1234.NEF'],
        ]);
        expect(manifestTrackedIds(manifest).size).toBeLessThanOrEqual(manifest.images.length);
    });

    it('de-duplicates repeated ids and handles an empty manifest', () => {
        expect(manifestTrackedIds(mk([[7, 'a.NEF'], [7, 'b.NEF']])).size).toBe(1);
        expect(manifestTrackedIds(mk([])).size).toBe(0);
    });
});
