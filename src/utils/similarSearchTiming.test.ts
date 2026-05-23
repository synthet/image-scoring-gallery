import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    getAdaptiveProgressConfig,
    readSimilarSearchTimingStore,
    recordSimilarSearchDuration,
    writeSimilarSearchTimingStore,
} from './similarSearchTiming';

const STORAGE_KEY = 'similar-search-timing-v1';

describe('similarSearchTiming', () => {
    beforeEach(() => {
        localStorage.removeItem(STORAGE_KEY);
    });

    afterEach(() => {
        localStorage.removeItem(STORAGE_KEY);
    });

    it('returns defaults when no samples exist', () => {
        const config = getAdaptiveProgressConfig('library');
        expect(config.progressMax).toBe(100);
        expect(config.estimatedMs).toBeGreaterThan(0);
        expect(config.tickMs).toBeGreaterThan(0);
    });

    it('records durations and adapts progress config from p75', () => {
        recordSimilarSearchDuration(2000, 'library');
        recordSimilarSearchDuration(3000, 'library');
        recordSimilarSearchDuration(4000, 'library');
        recordSimilarSearchDuration(10000, 'library');

        const config = getAdaptiveProgressConfig('library');
        expect(config.estimatedMs).toBeGreaterThanOrEqual(600);
        expect(config.estimatedMs).toBeLessThanOrEqual(45_000);
        expect(config.progressMax).toBeGreaterThanOrEqual(100);
        expect(config.tickMs).toBeGreaterThanOrEqual(30);
        expect(config.tickMs).toBeLessThanOrEqual(180);

        const store = readSimilarSearchTimingStore();
        expect(store.library).toHaveLength(4);
    });

    it('uses a higher progressMax for slow library searches', () => {
        writeSimilarSearchTimingStore({
            version: 1,
            library: Array.from({ length: 10 }, () => 12_000),
            folder: [],
        });
        const config = getAdaptiveProgressConfig('library');
        expect(config.progressMax).toBe(150);
    });
});
