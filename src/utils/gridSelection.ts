/**
 * Multi-selection for the photo grid (#239). The grid renders about 40 cards of possibly thousands, so
 * select-all is a flag with exclusions rather than a list of ids: with `all` set, `ids` holds the photos
 * left out; otherwise it holds the photos chosen.
 */
export interface GridSelection {
    all: boolean;
    ids: ReadonlySet<number>;
    /** Grid index of the last photo toggled, where a Shift+click range starts. */
    anchor: number | null;
}

export const EMPTY_SELECTION: GridSelection = { all: false, ids: new Set(), anchor: null };

export function isSelected(selection: GridSelection, id: number): boolean {
    return selection.all !== selection.ids.has(id);
}

export function selectedCount(selection: GridSelection, total: number): number {
    return selection.all ? Math.max(0, total - selection.ids.size) : selection.ids.size;
}

export function toggleSelected(selection: GridSelection, id: number, index: number): GridSelection {
    const ids = new Set(selection.ids);
    if (!ids.delete(id)) ids.add(id);
    return { ...selection, ids, anchor: index };
}

export function selectAll(): GridSelection {
    return { all: true, ids: new Set(), anchor: null };
}

/** Selects from the anchor to `index` in `orderedIds`, the grid's loaded photos. The anchor stays put. */
export function selectRange(selection: GridSelection, orderedIds: readonly number[], index: number): GridSelection {
    const anchor = selection.anchor ?? index;
    const ids = new Set(selection.ids);
    for (const id of orderedIds.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)) {
        if (selection.all) ids.delete(id);
        else ids.add(id);
    }
    return { ...selection, ids, anchor };
}

/**
 * The selected photos as records. An explicit selection is always among the loaded photos; select-all
 * also covers photos never loaded, so it pages through the same query the grid uses.
 */
export async function resolveSelection<T extends { id: number }>(
    selection: GridSelection,
    loaded: readonly T[],
    fetchPage: (offset: number, limit: number) => Promise<T[]>,
    pageSize = 500,
): Promise<T[]> {
    if (!selection.all) return loaded.filter((photo) => selection.ids.has(photo.id));
    const found = new Map<number, T>();
    // Only an empty page ends the loop: a source may cap the page size below what was asked for.
    for (let offset = 0; ;) {
        const page = await fetchPage(offset, pageSize);
        if (page.length === 0) return [...found.values()];
        for (const photo of page) {
            if (!selection.ids.has(photo.id)) found.set(photo.id, photo);
        }
        offset += page.length;
    }
}
