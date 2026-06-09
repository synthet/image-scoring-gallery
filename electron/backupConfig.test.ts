import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKUP_CONFIG, effectiveMaxPerCluster, loadBackupConfig, requiresStaleDeleteConfirmation } from './backupConfig';

describe('loadBackupConfig', () => {
    it('returns defaults when section missing', () => {
        expect(loadBackupConfig(undefined)).toEqual(DEFAULT_BACKUP_CONFIG);
        expect(DEFAULT_BACKUP_CONFIG.pruneStaleFiles).toBe(false);
        expect(DEFAULT_BACKUP_CONFIG.pruneDroppedForSpace).toBe(false);
        expect(DEFAULT_BACKUP_CONFIG.minScore).toBe(0.5);
    });

    it('merges partial overrides', () => {
        const cfg = loadBackupConfig({ minScore: 0.8, crossDayDedup: true });
        expect(cfg.minScore).toBe(0.8);
        expect(cfg.crossDayDedup).toBe(true);
        expect(cfg.diversityLambda).toBe(DEFAULT_BACKUP_CONFIG.diversityLambda);
    });
});

describe('effectiveMaxPerCluster', () => {
    it('returns 1 when disk is tight', () => {
        expect(effectiveMaxPerCluster(3, 0.2)).toBe(1);
    });

    it('returns up to config max when space is ample', () => {
        expect(effectiveMaxPerCluster(3, 0.95)).toBe(3);
    });

    it('caps at 2 for medium fill', () => {
        expect(effectiveMaxPerCluster(3, 0.6)).toBe(2);
    });
});

describe('requiresStaleDeleteConfirmation', () => {
    it('requires confirmation above absolute threshold', () => {
        expect(requiresStaleDeleteConfirmation(101, 500)).toBe(true);
        expect(requiresStaleDeleteConfirmation(49, 500)).toBe(false);
    });

    it('requires confirmation above fraction of manifest', () => {
        expect(requiresStaleDeleteConfirmation(20, 100)).toBe(true);
        expect(requiresStaleDeleteConfirmation(5, 100)).toBe(false);
    });
});
