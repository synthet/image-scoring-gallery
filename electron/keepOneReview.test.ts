import { describe, expect, it } from 'vitest';
import { buildKeepOneReview, keepOneImageIds, KEEPONE_REVIEW_SCHEMA } from './keepOneReview';

const frame = (id: number, extra: Record<string, unknown> = {}) => ({
    key: `k${id}`, image_id: id, file: `DSC_${id}.NEF`, capture_time: `2026-01-19T16:34:${id}`, iso: 800,
    af_state: 'unavailable', scores: { focus: 0.4, noise: 0.6, eye: 0.5, exposure: 0.6 },
    flags_at_freeze: { rating: 3, label: 'Green', pick_status: -1, cull_decision: 'reject' }, protected: [], ...extra,
});

const exportDoc = {
    schema: KEEPONE_REVIEW_SCHEMA,
    totals: { shoots: 1, clusters: 1, removed: 2 },
    shoots: [{
        shoot: 's1', folder: 'D:\\Photos\\2026-01-19', camera: 'Z8', run: 'keep-one-substack',
        counts: { frames: 3423, bytes: 66000000 },
        clusters: [{
            cluster: 0,
            keeper: frame(3),
            removed: [
                { ...frame(1), basis: 'head_sharpness', tie: false, jev: null },
                { ...frame(2), basis: 'tie', tie: true, jev: { choice: 'k3', confidence: 0.92, model: 'jev-1.14.0' } },
            ],
        }],
    }],
};

const live = [
    { id: 1, rating: 3, label: 'Green', pick_status: -1, thumbnail_path: '/t/1.jpg', file_path: '/p/1.NEF' },
    { id: 3, rating: 5, label: 'Green', pick_status: -1, thumbnail_path: '/t/3.jpg', file_path: '/p/3.NEF' },
];

describe('keepOneReview', () => {
    it('lists every referenced image id once', () => {
        expect(keepOneImageIds(exportDoc)).toEqual([3, 1, 2]);
        expect(keepOneImageIds({})).toEqual([]);
    });

    it('builds clusters with frozen scores, live flags and Jev ties', () => {
        const result = buildKeepOneReview(exportDoc, 'sha', live);
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.totals).toEqual({ shoots: 1, clusters: 1, removed: 2, frames: 3423, bytes: 66000000 });
        const cluster = result.shoots[0].clusters[0];
        expect(cluster.keeper.imageId).toBe(3);
        expect(cluster.keeper.thumbnailPath).toBe('/t/3.jpg');
        // rating changed 3 -> 5 since the freeze
        expect(cluster.keeper.changedSinceFreeze).toBe(true);
        expect(cluster.removed[0]).toMatchObject({ imageId: 1, basis: 'head_sharpness', tie: false, changedSinceFreeze: false });
        expect(cluster.removed[1].jev).toEqual({ choice: 'k3', confidence: 0.92, model: 'jev-1.14.0' });
    });

    it('marks frames that left the catalog instead of failing', () => {
        const result = buildKeepOneReview(exportDoc, 'sha', live);
        if (result.status !== 'ok') throw new Error('expected ok');
        expect(result.missingIds).toEqual([2]);
        expect(result.shoots[0].clusters[0].removed[1].live).toBeNull();
        expect(result.shoots[0].clusters[0].removed[1].changedSinceFreeze).toBe(false);
    });

    it('ignores pick_status when the live catalog has no such column', () => {
        const result = buildKeepOneReview(exportDoc, 'sha', [{ id: 1, rating: 3, label: 'Green' }]);
        if (result.status !== 'ok') throw new Error('expected ok');
        expect(result.shoots[0].clusters[0].removed[0].changedSinceFreeze).toBe(false);
    });

    it('falls back on a wrong schema or a malformed cluster', () => {
        expect(buildKeepOneReview({ schema: 'driftara-representative-preview/1', shoots: [] }, 'sha', [])).toMatchObject({
            status: 'fallback', reason: 'invalid_manifest',
        });
        expect(buildKeepOneReview(null, 'sha', [])).toMatchObject({ status: 'fallback', reason: 'invalid_manifest' });
        const broken = { ...exportDoc, shoots: [{ shoot: 's1', clusters: [{ cluster: 0, removed: [] }] }] };
        expect(buildKeepOneReview(broken, 'sha', [])).toMatchObject({ status: 'fallback', reason: 'invalid_manifest' });
    });
});
