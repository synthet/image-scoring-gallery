import { describe, expect, it } from 'vitest';
import {
    reconcileHasSignificantDrift,
    reconcileManifestWithDiskReport,
} from './backupAudit';
import type { BackupManifest } from './types';

describe('reconcileManifestWithDiskReport', () => {
    it('reports present, missing, and orphans with case-insensitive matching', () => {
        const manifest: BackupManifest = {
            updatedAt: '2026-01-01',
            images: [
                { id: 1, relPath: 'Cam/a.NEF', score: 0.9, size: 100, hash: '' },
                { id: 0, relPath: 'Cam/missing.nef', score: 0, size: 50, hash: '' },
            ],
        };
        const onDisk = new Set(['cam/a.nef', 'Cam/orphan.NEF']);
        const report = reconcileManifestWithDiskReport(manifest, onDisk, { xmpOnlyDirs: 2 });
        expect(report.manifestRows).toBe(2);
        expect(report.presentOnDisk).toBe(1);
        expect(report.missingOnDisk).toBe(1);
        expect(report.missingBytes).toBe(50);
        expect(report.missingPrebuild).toBe(1);
        expect(report.orphanFiles).toBe(1);
        expect(report.xmpOnlyDirs).toBe(2);
    });
});

describe('reconcileHasSignificantDrift', () => {
    it('flags large missing counts', () => {
        expect(
            reconcileHasSignificantDrift({
                manifestRows: 1000,
                presentOnDisk: 900,
                missingOnDisk: 100,
                missingBytes: 1,
                missingPrebuild: 0,
                orphanFiles: 0,
                xmpOnlyDirs: 0,
            }),
        ).toBe(true);
        expect(
            reconcileHasSignificantDrift({
                manifestRows: 100,
                presentOnDisk: 99,
                missingOnDisk: 1,
                missingBytes: 1,
                missingPrebuild: 0,
                orphanFiles: 0,
                xmpOnlyDirs: 0,
            }),
        ).toBe(false);
    });
});
