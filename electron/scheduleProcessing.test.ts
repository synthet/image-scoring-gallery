import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
    markImagePhasesPending: vi.fn().mockResolvedValue(undefined),
    markFolderImagePhasesPending: vi.fn().mockResolvedValue(2),
}));

import type { ApiService } from './apiService';
import * as db from './db';
import { scheduleProcessingForImages, scheduleProcessingForImportedFolder } from './scheduleProcessing';

const FULL_PIPELINE = ['indexing', 'metadata', 'score', 'cluster', 'tag', 'bird_species'];

/** Direct prerequisites from backend `modules/phases.py` PHASE_PREREQUISITES, in submit spelling. */
const PREREQUISITES: Record<string, string[]> = {
    metadata: ['indexing'],
    score: ['metadata'],
    cluster: ['score'],
    tag: ['metadata'],
    bird_species: ['tag'],
};

function api(overrides: Partial<Record<'isAvailable' | 'submitPipeline', unknown>> = {}) {
    return {
        isAvailable: vi.fn().mockResolvedValue(true),
        submitPipeline: vi.fn().mockResolvedValue({ success: true, data: { job_id: 7 } }),
        ...overrides,
    } as unknown as ApiService & { submitPipeline: ReturnType<typeof vi.fn> };
}

function submittedStages(service: { submitPipeline: ReturnType<typeof vi.fn> }): string[] {
    return service.submitPipeline.mock.calls[0][0].stage_codes;
}

describe('scheduleProcessingForImages', () => {
    beforeEach(() => vi.clearAllMocks());

    it('submits every pipeline stage for the imported images', async () => {
        const service = api();

        const result = await scheduleProcessingForImages(service, { folderPath: 'D:/Photos/a', imageIds: [1, 2] });

        expect(result).toEqual({ method: 'api', jobId: 7 });
        expect(service.submitPipeline).toHaveBeenCalledWith({
            workspace_target: 'D:/Photos/a',
            image_ids: [1, 2],
            stage_codes: FULL_PIPELINE,
            skip_existing: true,
        });
    });

    it('orders each stage after its prerequisites', async () => {
        const service = api();

        await scheduleProcessingForImages(service, { folderPath: 'D:/Photos/a', imageIds: [1] });

        const stages = submittedStages(service);
        for (const [stage, prerequisites] of Object.entries(PREREQUISITES)) {
            for (const prerequisite of prerequisites) {
                expect(stages.indexOf(prerequisite)).toBeGreaterThanOrEqual(0);
                expect(stages.indexOf(prerequisite)).toBeLessThan(stages.indexOf(stage));
            }
        }
    });

    it('leaves the images pending for a later run when the API is down', async () => {
        const service = api({ isAvailable: vi.fn().mockResolvedValue(false) });

        const result = await scheduleProcessingForImages(service, { folderPath: 'D:/Photos/a', imageIds: [1, 2] });

        expect(result).toEqual({ method: 'queue', queuedCount: 2, reason: 'api-unavailable' });
        expect(service.submitPipeline).not.toHaveBeenCalled();
        expect(db.markImagePhasesPending).toHaveBeenCalledWith([1, 2]);
    });

    it('submits nothing when no images were imported', async () => {
        const service = api();

        await expect(scheduleProcessingForImages(service, { folderPath: 'D:/Photos/a', imageIds: [] }))
            .resolves.toEqual({ method: 'none' });
        expect(service.submitPipeline).not.toHaveBeenCalled();
    });
});

describe('scheduleProcessingForImportedFolder', () => {
    beforeEach(() => vi.clearAllMocks());

    it('submits every pipeline stage for the folder', async () => {
        const service = api();

        await scheduleProcessingForImportedFolder(service, 'D:/Photos/a', 3);

        expect(service.submitPipeline).toHaveBeenCalledWith({
            workspace_target: 'D:/Photos/a',
            stage_codes: FULL_PIPELINE,
            skip_existing: true,
        });
    });
});
