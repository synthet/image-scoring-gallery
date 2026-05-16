/** Mirrors `electron/scheduleProcessing.ts` IPC payload shape. */
export type ScheduleResult =
    | { method: 'api'; jobId?: string | number }
    | { method: 'queue'; queuedCount: number; reason: 'api-unavailable' | 'api-error'; error?: string }
    | { method: 'none' };

/** Loose shape returned from import/sync IPC before narrowing. */
export type ScheduleResultInput = {
    method: 'api' | 'queue' | 'none';
    jobId?: string | number;
    queuedCount?: number;
    reason?: 'api-unavailable' | 'api-error';
    error?: string;
};

export function coerceScheduleResult(raw: ScheduleResultInput | null | undefined): ScheduleResult | null {
    if (!raw) {
        return null;
    }
    if (raw.method === 'none') {
        return { method: 'none' };
    }
    if (raw.method === 'api') {
        return { method: 'api', jobId: raw.jobId };
    }
    if (raw.method === 'queue') {
        return {
            method: 'queue',
            queuedCount: raw.queuedCount ?? 0,
            reason: raw.reason ?? 'api-unavailable',
            error: raw.error,
        };
    }
    return { method: 'none' };
}

export function coerceScheduleResults(raw: ScheduleResultInput[] | null | undefined): ScheduleResult[] {
    if (!raw?.length) {
        return [];
    }
    return raw.map((item) => coerceScheduleResult(item) ?? { method: 'none' as const });
}

export function formatScheduleResultLine(p: ScheduleResult): string | null {
    if (p.method === 'none') {
        return null;
    }
    if (p.method === 'api') {
        const j = p.jobId != null && String(p.jobId).length > 0 ? String(p.jobId) : '';
        return j ? `Submitted to backend (job ${j})` : 'Submitted to backend';
    }
    const n = p.queuedCount;
    const head = p.reason === 'api-unavailable' ? 'Backend offline' : 'Pipeline submit failed';
    if (n > 0) {
        return p.error ? `${head}: ${p.error} — ${n} image(s) queued for next run` : `${head} — ${n} image(s) queued for next run`;
    }
    return p.error ? `${head}: ${p.error}` : `${head} — queued for next run`;
}

export function formatScheduleResultsSummary(results: ScheduleResult[]): string | null {
    const parts = results.map(formatScheduleResultLine).filter((x): x is string => x != null);
    return parts.length > 0 ? parts.join(' · ') : null;
}
