/**
 * Stage timer for long-running main-process operations (backup, sync).
 *
 * Logs both the per-stage delta and the cumulative total so a stall is obvious from
 * the log alone — a blocked stage shows up as a large `+Nms` on the next line.
 */
export type StageLog = {
    stage: (message: string, fields?: Record<string, unknown>) => void;
    totalMs: () => number;
};

export function createStageLog(scope: string): StageLog {
    const t0 = Date.now();
    let last = t0;
    return {
        stage(message: string, fields?: Record<string, unknown>): void {
            const now = Date.now();
            const suffix = fields
                ? ' ' + Object.entries(fields)
                    // Fixed locale: the system locale separator varies (and can be a
                    // no-break space), which makes logs inconsistent across machines.
                    .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toLocaleString('en-US') : String(v)}`)
                    .join(' ')
                : '';
            console.log(
                `[${scope}] ${message}${suffix}`
                + ` (+${now - last}ms, total ${((now - t0) / 1000).toFixed(1)}s)`,
            );
            last = now;
        },
        totalMs: (): number => Date.now() - t0,
    };
}
