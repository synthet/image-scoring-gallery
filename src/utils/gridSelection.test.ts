import { describe, expect, it, vi } from 'vitest';
import {
    EMPTY_SELECTION, isSelected, resolveSelection, selectAll, selectRange, selectedCount, toggleSelected,
} from './gridSelection';

describe('grid selection (#239)', () => {
    it('toggles single photos on and off', () => {
        const one = toggleSelected(EMPTY_SELECTION, 7, 0);
        expect(isSelected(one, 7)).toBe(true);
        expect(selectedCount(one, 100)).toBe(1);
        expect(isSelected(toggleSelected(one, 7, 0), 7)).toBe(false);
    });

    it('select-all counts every photo, not only loaded ones', () => {
        const all = selectAll();
        expect(selectedCount(all, 3000)).toBe(3000);
        expect(isSelected(all, 123456)).toBe(true);
    });

    it('toggling off after select-all records an exclusion, and toggling on removes it', () => {
        const excluded = toggleSelected(selectAll(), 5, 0);
        expect(isSelected(excluded, 5)).toBe(false);
        expect(selectedCount(excluded, 3000)).toBe(2999);
        expect(selectedCount(toggleSelected(excluded, 5, 0), 3000)).toBe(3000);
    });

    it('selects the range from the anchor, in either direction', () => {
        const ids = [10, 11, 12, 13, 14];
        const start = toggleSelected(EMPTY_SELECTION, 13, 3);
        const range = selectRange(start, ids, 1);
        expect(ids.filter((id) => isSelected(range, id))).toEqual([11, 12, 13]);
    });

    it('a range without an anchor selects just the clicked photo', () => {
        const range = selectRange(EMPTY_SELECTION, [10, 11, 12], 2);
        expect(selectedCount(range, 3)).toBe(1);
        expect(isSelected(range, 12)).toBe(true);
    });

    it('a range restores excluded photos during select-all', () => {
        const ids = [10, 11, 12];
        const excluded = toggleSelected(toggleSelected(selectAll(), 10, 0), 11, 1);
        const range = selectRange(excluded, ids, 0);
        expect(isSelected(range, 10)).toBe(true);
        expect(isSelected(range, 11)).toBe(true);
    });

    describe('resolveSelection', () => {
        const photos = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
        const pages = () => vi.fn(async (offset: number, limit: number) => photos.slice(offset, offset + limit));

        it('uses the loaded photos for an explicit selection and fetches nothing', async () => {
            const fetchPage = pages();
            const picked = toggleSelected(toggleSelected(EMPTY_SELECTION, 2, 1), 4, 3);
            expect(await resolveSelection(picked, photos, fetchPage)).toEqual([{ id: 2 }, { id: 4 }]);
            expect(fetchPage).not.toHaveBeenCalled();
        });

        it('pages through every photo for select-all and drops the exclusions', async () => {
            const excluded = toggleSelected(selectAll(), 3, 2);
            const got = await resolveSelection(excluded, photos.slice(0, 2), pages(), 3);
            expect(got.map((p) => p.id)).toEqual([1, 2, 4, 5, 6, 7]);
        });

        it('reaches every photo when the source caps the page size', async () => {
            const capped = vi.fn(async (offset: number) => photos.slice(offset, offset + 2));
            expect(await resolveSelection(selectAll(), [], capped, 500)).toHaveLength(photos.length);
        });

        it('does not repeat a photo that two pages both return', async () => {
            const fetchPage = vi.fn(async (offset: number) => (offset === 0 ? [{ id: 1 }, { id: 2 }] : offset === 2 ? [{ id: 2 }] : []));
            expect((await resolveSelection(selectAll(), [], fetchPage, 2)).map((p) => p.id)).toEqual([1, 2]);
        });
    });
});
