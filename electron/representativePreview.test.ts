import { describe, expect, it } from 'vitest';
import {
    buildRepresentativePreview,
    REPRESENTATIVE_PREVIEW_SCHEMA,
    type RepresentativeLiveFlags,
} from './representativePreview';

const FROZEN = { rating: 2, label: 'Red', pick_status: 1 };

/** Frames a..e (image ids 1..5) in capture order: group a+b+c, group d+e. */
function manifest(overrides: Record<string, unknown> = {}) {
    const keys = ['a', 'b', 'c', 'd', 'e'];
    return {
        schema: REPRESENTATIVE_PREVIEW_SCHEMA,
        shoot: { key: 'shoot1' },
        frames: keys.map((key, i) => ({
            key, image_id: i + 1, capture_time: `2026-01-19T12:00:0${i}`, protected: [] as string[], identity_resolved: true,
            flags_at_freeze: FROZEN,
        })),
        groups: [{ representative: 'b', members: ['a', 'b', 'c'] }, { representative: 'd', members: ['d', 'e'] }],
        singletons: [],
        always_visible: [],
        ...overrides,
    };
}

function live(ids = [1, 2, 3, 4, 5], change: Partial<RepresentativeLiveFlags> & { id?: number } = {}): RepresentativeLiveFlags[] {
    return ids.map((id) => ({ id, ...FROZEN, ...(change.id === id ? change : {}) }));
}

describe('buildRepresentativePreview', () => {
    it('collapses each group to its representative and lists every frame exactly once', () => {
        const result = buildRepresentativePreview(manifest(), 'sha', live());
        expect(result).toMatchObject({ status: 'ok', manifestSha256: 'sha', shootKey: 'shoot1', frameCount: 5 });
        if (result.status !== 'ok') return;
        expect(result.cards).toEqual([
            { representativeId: 2, memberIds: [2, 1, 3] },
            { representativeId: 4, memberIds: [4, 5] },
        ]);
        expect(result.cards.flatMap((c) => c.memberIds).sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('keeps protected, unresolved and always-visible frames on their own cards', () => {
        const m = manifest({ always_visible: ['e'] });
        m.frames[0].protected = ['exported'];
        m.frames[2].identity_resolved = false;
        const result = buildRepresentativePreview(m, 'sha', live());
        expect(result.status === 'ok' && result.cards).toEqual([
            { representativeId: 1, memberIds: [1] },
            { representativeId: 2, memberIds: [2] },
            { representativeId: 3, memberIds: [3] },
            { representativeId: 4, memberIds: [4] },
            { representativeId: 5, memberIds: [5] },
        ]);
    });

    it('shows a frame on its own when its live flags changed since the freeze', () => {
        for (const change of [{ id: 3, rating: 5 }, { id: 3, label: 'Green' }, { id: 3, pick_status: -1 }]) {
            const result = buildRepresentativePreview(manifest(), 'sha', live(undefined, change));
            expect(result.status === 'ok' && result.cards[0]).toEqual({ representativeId: 2, memberIds: [2, 1] });
            expect(result.status === 'ok' && result.changedSinceFreeze).toEqual([3]);
        }
    });

    it('falls back when the folder and the manifest disagree', () => {
        expect(buildRepresentativePreview(manifest(), 'sha', live([1, 2, 3, 4]))).toMatchObject({ reason: 'stale_membership' });
        expect(buildRepresentativePreview(manifest(), 'sha', live([1, 2, 3, 4, 5, 6]))).toMatchObject({ reason: 'stale_membership' });
        const noPick = live().map(({ pick_status: _unused, ...rest }) => rest);
        expect(buildRepresentativePreview(manifest(), 'sha', noPick)).toMatchObject({ reason: 'flags_unavailable' });
    });

    it('falls back on an invalid or incomplete manifest', () => {
        expect(buildRepresentativePreview({}, 'sha', live())).toMatchObject({ reason: 'invalid_manifest' });
        expect(buildRepresentativePreview(manifest({ schema: 'other/1' }), 'sha', live())).toMatchObject({ reason: 'invalid_manifest' });
        expect(buildRepresentativePreview(manifest({ groups: [{ representative: 'b', members: ['a', 'c'] }] }), 'sha', live()))
            .toMatchObject({ reason: 'invalid_manifest' });
        // e missing from every card, then e listed twice
        expect(buildRepresentativePreview(manifest({ groups: [{ representative: 'b', members: ['a', 'b', 'c', 'd'] }] }), 'sha', live()))
            .toMatchObject({ reason: 'incomplete_membership' });
        expect(buildRepresentativePreview(manifest({ singletons: ['e'] }), 'sha', live()))
            .toMatchObject({ reason: 'incomplete_membership' });
        const noId = manifest();
        (noId.frames[1] as { image_id: unknown }).image_id = null;
        expect(buildRepresentativePreview(noId, 'sha', live())).toMatchObject({ reason: 'incomplete_membership' });
    });

    it('orders an opened group sharpest-first by the focus hint, missing hints last', () => {
        const m = manifest();
        const focus: Record<string, number | null> = { a: 0.31, b: 0.42, c: null, d: 0.2, e: 0.2 };
        for (const f of m.frames) (f as { focus?: number | null }).focus = focus[f.key];
        const result = buildRepresentativePreview(m, 'sha', live());
        expect(result.status === 'ok' && result.cards).toEqual([
            { representativeId: 2, memberIds: [2, 1, 3] },
            { representativeId: 4, memberIds: [4, 5] },
        ]);
        (m.frames[0] as { focus?: number }).focus = 0.9;
        const reordered = buildRepresentativePreview(m, 'sha', live());
        expect(reordered.status === 'ok' && reordered.cards[0]).toEqual({ representativeId: 2, memberIds: [1, 2, 3] });
        expect(reordered.status === 'ok' && reordered.focusById).toEqual({ 1: 0.9, 2: 0.42, 4: 0.2, 5: 0.2 });
    });

    it('keeps the capture order and an empty focus map without hints', () => {
        const result = buildRepresentativePreview(manifest(), 'sha', live());
        expect(result.status === 'ok' && result.focusById).toEqual({});
    });
});
