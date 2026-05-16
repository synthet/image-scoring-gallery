import { describe, expect, it } from 'vitest';
import { formatScheduleResultLine, formatScheduleResultsSummary } from './scheduleProcessingOutcome';

describe('scheduleProcessingOutcome', () => {
    it('formats api result with job id', () => {
        expect(formatScheduleResultLine({ method: 'api', jobId: 42 })).toBe('Submitted to backend (job 42)');
    });

    it('formats queue result', () => {
        expect(
            formatScheduleResultLine({ method: 'queue', queuedCount: 3, reason: 'api-unavailable' })
        ).toBe('Backend offline — 3 image(s) queued for next run');
    });

    it('returns null for none', () => {
        expect(formatScheduleResultLine({ method: 'none' })).toBeNull();
    });

    it('joins multiple schedule lines', () => {
        const s = formatScheduleResultsSummary([
            { method: 'api', jobId: 1 },
            { method: 'queue', queuedCount: 2, reason: 'api-error', error: 'busy' },
        ]);
        expect(s).toContain('job 1');
        expect(s).toContain('·');
        expect(s).toContain('2 image(s)');
    });
});
