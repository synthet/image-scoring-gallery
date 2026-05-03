/** Mirrors `electron/scheduleProcessing.ts` IPC payload shape. */
export type ScheduleResult =
    | { method: 'api'; jobId?: string | number }
    | { method: 'queue'; queuedCount: number; reason: 'api-unavailable' | 'api-error'; error?: string }
    | { method: 'none' };

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
