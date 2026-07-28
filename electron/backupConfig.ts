/**
 * Backup selection config from gallery config.json (backup section).
 */

export interface BackupConfig {
    /** Minimum score_general (0–1) to include in backup candidates. */
    minScore: number;
    /** MMR balance: 1 = score only, 0 = diversity only. */
    diversityLambda: number;
    /** Max images to keep per similarity cluster when space allows. */
    maxPerCluster: number;
    /** Collapse near-duplicates across days within camera+lens+week buckets. */
    crossDayDedup: boolean;
    /** Max IDs per pgvector pair-query batch. */
    pairBatchSize: number;
    /** When true, delete backup files no longer in the current selection. Default false (additive). */
    pruneStaleFiles: boolean;
    /** When true, delete destination copies dropped for insufficient disk space. Default false. */
    pruneDroppedForSpace: boolean;
    /** Fraction of volume capacity reserved as free-space buffer. */
    reserveFraction: number;
    /** Include curated picks (pick_status=1 / Green|Blue|Purple) even below minScore. */
    includeCurated: boolean;
    /** When true, evict lower-scoring resident files to admit higher-scoring drops. Default false. */
    rotateLowScores: boolean;
    /** Incoming must beat resident by this much to rotate. */
    rotateScoreMargin: number;
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
    minScore: 0.5,
    diversityLambda: 0.7,
    maxPerCluster: 2,
    crossDayDedup: false,
    pairBatchSize: 500,
    pruneStaleFiles: false,
    pruneDroppedForSpace: false,
    reserveFraction: 0.02,
    includeCurated: true,
    rotateLowScores: false,
    rotateScoreMargin: 0.05,
};

/** Require UI confirmation before deleting this many stale files. */
export const STALE_DELETE_CONFIRM_THRESHOLD = 100;

/** Require confirmation when stale deletes exceed this fraction of manifest. */
export const STALE_DELETE_CONFIRM_FRACTION = 0.1;

function asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function clampReserveFraction(value: number): number {
    return Math.min(0.5, Math.max(0, value));
}

/** Parse backup section from merged app config. */
export function loadBackupConfig(raw: Record<string, unknown> | undefined): BackupConfig {
    if (!raw) return { ...DEFAULT_BACKUP_CONFIG };
    return {
        minScore: asNumber(raw.minScore, DEFAULT_BACKUP_CONFIG.minScore),
        diversityLambda: asNumber(raw.diversityLambda, DEFAULT_BACKUP_CONFIG.diversityLambda),
        maxPerCluster: Math.max(1, Math.floor(asNumber(raw.maxPerCluster, DEFAULT_BACKUP_CONFIG.maxPerCluster))),
        crossDayDedup: asBoolean(raw.crossDayDedup, DEFAULT_BACKUP_CONFIG.crossDayDedup),
        pairBatchSize: Math.max(50, Math.floor(asNumber(raw.pairBatchSize, DEFAULT_BACKUP_CONFIG.pairBatchSize))),
        pruneStaleFiles: asBoolean(raw.pruneStaleFiles, DEFAULT_BACKUP_CONFIG.pruneStaleFiles),
        pruneDroppedForSpace: asBoolean(raw.pruneDroppedForSpace, DEFAULT_BACKUP_CONFIG.pruneDroppedForSpace),
        reserveFraction: clampReserveFraction(
            asNumber(raw.reserveFraction, DEFAULT_BACKUP_CONFIG.reserveFraction),
        ),
        includeCurated: asBoolean(raw.includeCurated, DEFAULT_BACKUP_CONFIG.includeCurated),
        rotateLowScores: asBoolean(raw.rotateLowScores, DEFAULT_BACKUP_CONFIG.rotateLowScores),
        rotateScoreMargin: Math.max(
            0,
            asNumber(raw.rotateScoreMargin, DEFAULT_BACKUP_CONFIG.rotateScoreMargin),
        ),
    };
}

/**
 * Scale max keepers per cluster from disk pressure (1 when tight, up to config max when ample).
 */
export function effectiveMaxPerCluster(configMax: number, roughFillRatio: number): number {
    if (configMax <= 1) return 1;
    if (roughFillRatio >= 0.9) return configMax;
    if (roughFillRatio >= 0.5) return Math.min(configMax, 2);
    return 1;
}

export function requiresStaleDeleteConfirmation(
    wouldDeleteFiles: number,
    manifestCount: number,
): boolean {
    if (wouldDeleteFiles <= 0) return false;
    if (wouldDeleteFiles >= STALE_DELETE_CONFIRM_THRESHOLD) return true;
    if (manifestCount > 0 && wouldDeleteFiles / manifestCount >= STALE_DELETE_CONFIRM_FRACTION) {
        return true;
    }
    return false;
}
