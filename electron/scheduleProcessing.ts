import type { ApiService } from './apiService';
import * as db from './db';

const PIPELINE_OPERATIONS = ['metadata', 'score', 'tag', 'cluster'] as const;

/** Keep in sync with `src/utils/scheduleProcessingOutcome.ts` (renderer). */
export type ScheduleResult =
    | { method: 'api'; jobId?: string | number }
    | { method: 'queue'; queuedCount: number; reason: 'api-unavailable' | 'api-error'; error?: string }
    | { method: 'none' };

function extractJobId(data: Record<string, unknown> | undefined): string | number | undefined {
    if (!data) {
        return undefined;
    }
    const j = data.job_id ?? data.workflow_run_id;
    return typeof j === 'string' || typeof j === 'number' ? j : undefined;
}

/**
 * After direct-DB import/sync: prefer pipeline submit; on failure mark `image_phase_status` for given ids only.
 */
export async function scheduleProcessingForImages(
    api: ApiService,
    opts: { folderPath: string; imageIds: number[] }
): Promise<ScheduleResult> {
    const { folderPath, imageIds } = opts;
    if (imageIds.length === 0) {
        return { method: 'none' };
    }

    const available = await api.isAvailable().catch(() => false);
    if (!available) {
        try {
            await db.markImagePhasesPending(imageIds);
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { method: 'queue', queuedCount: 0, reason: 'api-unavailable', error };
        }
        return { method: 'queue', queuedCount: imageIds.length, reason: 'api-unavailable' };
    }

    try {
        const res = await api.submitPipeline({
            input_path: folderPath,
            image_ids: imageIds,
            operations: [...PIPELINE_OPERATIONS],
            skip_existing: true,
        });
        if (res?.success) {
            return { method: 'api', jobId: extractJobId(res.data) };
        }
        const msg = res?.message ?? 'Pipeline submit rejected';
        try {
            await db.markImagePhasesPending(imageIds);
        } catch {
            /* best-effort */
        }
        return { method: 'queue', queuedCount: imageIds.length, reason: 'api-error', error: msg };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        try {
            await db.markImagePhasesPending(imageIds);
        } catch {
            /* best-effort */
        }
        return { method: 'queue', queuedCount: imageIds.length, reason: 'api-error', error };
    }
}

/**
 * After backend API import/register (no local image ids): submit folder to pipeline or mark folder-wide fallback.
 */
export async function scheduleProcessingForImportedFolder(
    api: ApiService,
    folderPath: string,
    addedCount: number
): Promise<ScheduleResult> {
    if (addedCount <= 0) {
        return { method: 'none' };
    }

    const available = await api.isAvailable().catch(() => false);
    if (!available) {
        try {
            const n = await db.markFolderImagePhasesPending(folderPath);
            return { method: 'queue', queuedCount: n, reason: 'api-unavailable' };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { method: 'queue', queuedCount: 0, reason: 'api-unavailable', error };
        }
    }

    try {
        const res = await api.submitPipeline({
            input_path: folderPath,
            operations: [...PIPELINE_OPERATIONS],
            skip_existing: true,
        });
        if (res?.success) {
            return { method: 'api', jobId: extractJobId(res.data) };
        }
        const msg = res?.message ?? 'Pipeline submit rejected';
        let n = 0;
        try {
            n = await db.markFolderImagePhasesPending(folderPath);
        } catch {
            /* best-effort */
        }
        return { method: 'queue', queuedCount: n, reason: 'api-error', error: msg };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        let n = 0;
        try {
            n = await db.markFolderImagePhasesPending(folderPath);
        } catch {
            /* best-effort */
        }
        return { method: 'queue', queuedCount: n, reason: 'api-error', error };
    }
}
