import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bridge } from '../bridge';
import { clearImageEvidenceCacheForTests, useImageEvidence } from './useImageEvidence';
import type { ImageEvidencePayload } from '../types/imageEvidence';

vi.mock('../bridge', () => ({ bridge: { getImageEvidence: vi.fn() } }));

const payload: ImageEvidencePayload = {
    evidence_schema_version: 1,
    extractor_version: 'test',
    image_id: 1,
    display_width: 100,
    display_height: 100,
    gates: { region: false, mask: false, keypoints: false, focus_grid: false, noise_grid: false },
    limitations: [],
    criteria: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    clearImageEvidenceCacheForTests();
});

describe('useImageEvidence', () => {
    it('loads evidence, reuses the cache, and hides data while disabled', async () => {
        vi.mocked(bridge.getImageEvidence).mockResolvedValue(payload);
        const { result, rerender } = renderHook(
            ({ enabled }) => useImageEvidence(1, enabled),
            { initialProps: { enabled: true } },
        );
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.data).toEqual(payload));
        expect(result.current.loading).toBe(false);
        rerender({ enabled: false });
        expect(result.current.data).toBeNull();
        rerender({ enabled: true });
        expect(result.current.data).toEqual(payload);
        expect(bridge.getImageEvidence).toHaveBeenCalledTimes(1);
    });

    it('clears the previous image while another image loads', async () => {
        vi.mocked(bridge.getImageEvidence)
            .mockResolvedValueOnce(payload)
            .mockResolvedValueOnce({ ...payload, image_id: 2 });
        const { result, rerender } = renderHook(({ id }) => useImageEvidence(id, true), {
            initialProps: { id: 1 },
        });
        await waitFor(() => expect(result.current.data?.image_id).toBe(1));
        rerender({ id: 2 });
        expect(result.current.data).toBeNull();
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.data?.image_id).toBe(2));
    });

    it('reports fetch errors and refreshes after a failure', async () => {
        vi.mocked(bridge.getImageEvidence)
            .mockRejectedValueOnce(new Error('Unavailable'))
            .mockResolvedValueOnce(payload);
        const { result } = renderHook(() => useImageEvidence(1, true));
        await waitFor(() => expect(result.current.error).toBe('Unavailable'));
        expect(result.current.loading).toBe(false);
        act(() => result.current.refresh());
        expect(result.current.loading).toBe(true);
        expect(result.current.error).toBeNull();
        await waitFor(() => expect(result.current.data).toEqual(payload));
    });
});
