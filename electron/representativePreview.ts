/**
 * Representative preview: an opt-in, read-only browsing view built from a study manifest
 * (`driftara-representative-preview/1`, exported by image-scoring-skills `represent-export`).
 *
 * Each manifest group collapses to one card for its representative; members stay one click away.
 * The view never writes ratings, labels, flags or files. Anything it cannot trust falls back to
 * the ordinary grid: an unreadable or malformed manifest, frames that are not listed exactly once,
 * or a folder whose image ids no longer match the manifest.
 *
 * Frames always get their own card when the manifest marks them protected or unresolved, or when
 * their live rating, label or pick status differs from the value frozen in the manifest. The
 * pipeline rates and labels every frame, so only a change since the freeze shows a user override.
 *
 * Pure: no Electron, filesystem or database imports, so it is shared by main-process IPC and tests.
 */

export const REPRESENTATIVE_PREVIEW_SCHEMA = 'driftara-representative-preview/1';

export type RepresentativeFallbackReason =
    | 'cancelled'
    | 'unreadable'
    | 'invalid_manifest'
    | 'incomplete_membership'
    | 'stale_membership'
    | 'flags_unavailable'
    // renderer-side: the view needs the whole unfiltered folder, and is invalidated by a removal
    | 'no_folder'
    | 'filters_active'
    | 'folder_changed';

export interface RepresentativeCard {
    /** Image id shown on the card. */
    representativeId: number;
    /**
     * Image ids the card stands for. Length 1 = plain image. Opened groups list members sharpest-first by the
     * manifest's focus hint (missing hints last, ties in capture order); without hints, representative first, then
     * capture order.
     */
    memberIds: number[];
}

export type RepresentativePreviewResult =
    | {
        status: 'ok';
        manifestSha256: string;
        shootKey: string;
        frameCount: number;
        cards: RepresentativeCard[];
        /** Frames shown on their own because their live flags changed since the freeze. */
        changedSinceFreeze: number[];
        /** Focus hint by image id, for display; absent when the manifest has none. */
        focusById: Record<number, number>;
    }
    | { status: 'fallback'; reason: RepresentativeFallbackReason; detail: string };

/** IPC payload: the preview plus the folder's grid rows (empty unless the preview is ok). */
export interface RepresentativePreviewLoad {
    preview: RepresentativePreviewResult;
    images: unknown[];
}

/** Live catalog flags for one image; `pick_status` undefined means the column is unavailable. */
export interface RepresentativeLiveFlags {
    id: number;
    rating: number | null;
    label: string | null;
    pick_status?: number | null;
}

interface ManifestFrame {
    key: string;
    image_id: number;
    capture_time?: string | null;
    protected?: string[];
    identity_resolved?: boolean;
    flags_at_freeze?: { rating?: number | null; label?: string | null; pick_status?: number | null };
    /** Optional ordering hint (refcull_focus, higher is sharper); never a decision. */
    focus?: number | null;
}

interface Manifest {
    schema: string;
    shoot: { key: string };
    frames: ManifestFrame[];
    groups: { representative: string; members: string[] }[];
    singletons: string[];
    always_visible: string[];
}

function fallback(reason: RepresentativeFallbackReason, detail: string): RepresentativePreviewResult {
    return { status: 'fallback', reason, detail };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** Structural check of the parsed JSON; returns the manifest or a reason it cannot be used. */
export function parseRepresentativeManifest(json: unknown): Manifest | RepresentativePreviewResult {
    if (!isObject(json) || json.schema !== REPRESENTATIVE_PREVIEW_SCHEMA) {
        return fallback('invalid_manifest', `expected schema ${REPRESENTATIVE_PREVIEW_SCHEMA}`);
    }
    const { shoot, frames, groups, singletons, always_visible: alwaysVisible } = json;
    if (!isObject(shoot) || typeof shoot.key !== 'string' || !Array.isArray(frames) || !Array.isArray(groups)
        || !isStringArray(singletons) || !isStringArray(alwaysVisible)) {
        return fallback('invalid_manifest', 'missing shoot, frames, groups, singletons or always_visible');
    }
    for (const f of frames) {
        if (!isObject(f) || typeof f.key !== 'string' || !Number.isInteger(f.image_id)) {
            return fallback('incomplete_membership', 'every frame needs a key and an integer image_id');
        }
    }
    for (const g of groups) {
        if (!isObject(g) || typeof g.representative !== 'string' || !isStringArray(g.members)
            || !g.members.includes(g.representative)) {
            return fallback('invalid_manifest', 'every group needs a representative listed among its members');
        }
    }
    return json as unknown as Manifest;
}

const isFocus = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Members sharpest-first by the focus hint (missing last, ties keep the given order); unchanged without hints. */
export function sharpestFirst(members: ManifestFrame[]): number[] {
    if (!members.some((f) => isFocus(f.focus))) return members.map((f) => f.image_id);
    return members
        .map((f, i) => ({ f, i }))
        .sort((x, y) => {
            const fx = isFocus(x.f.focus) ? x.f.focus : -Infinity;
            const fy = isFocus(y.f.focus) ? y.f.focus : -Infinity;
            return fy - fx || x.i - y.i;
        })
        .map(({ f }) => f.image_id);
}

function sameFlags(frozen: ManifestFrame['flags_at_freeze'], live: RepresentativeLiveFlags): boolean {
    const norm = (v: unknown) => (v === undefined ? null : v);
    return norm(frozen?.rating) === norm(live.rating)
        && norm(frozen?.label) === norm(live.label)
        && norm(frozen?.pick_status) === norm(live.pick_status);
}

/**
 * Cards for the folder, in manifest capture order, or a fallback. `liveFlags` must be every image
 * row of the folder the preview is opened on.
 */
export function buildRepresentativePreview(
    json: unknown,
    manifestSha256: string,
    liveFlags: RepresentativeLiveFlags[],
): RepresentativePreviewResult {
    const parsed = parseRepresentativeManifest(json);
    if ('status' in parsed) return parsed;
    const manifest = parsed;

    const byKey = new Map<string, ManifestFrame>();
    for (const f of manifest.frames) {
        if (byKey.has(f.key)) return fallback('incomplete_membership', `frame ${f.key} is listed twice`);
        byKey.set(f.key, f);
    }
    const listed = [...manifest.groups.flatMap((g) => g.members), ...manifest.singletons];
    const seen = new Set<string>();
    for (const k of listed) {
        if (!byKey.has(k)) return fallback('incomplete_membership', `group member ${k} is not a manifest frame`);
        if (seen.has(k)) return fallback('incomplete_membership', `frame ${k} appears in more than one card`);
        seen.add(k);
    }
    if (seen.size !== byKey.size) {
        return fallback('incomplete_membership', `${byKey.size - seen.size} frames are in no group or singleton`);
    }

    const live = new Map(liveFlags.map((r) => [r.id, r]));
    const manifestIds = new Set(manifest.frames.map((f) => f.image_id));
    const missing = [...manifestIds].filter((id) => !live.has(id)).length;
    const extra = liveFlags.filter((r) => !manifestIds.has(r.id)).length;
    if (missing || extra || manifestIds.size !== manifest.frames.length) {
        return fallback('stale_membership',
            `folder and manifest differ: ${missing} manifest frames missing, ${extra} folder images not in the manifest`);
    }
    if (liveFlags.some((r) => r.pick_status === undefined)) {
        return fallback('flags_unavailable', 'pick status is unavailable, so user changes cannot be detected');
    }

    const changed: number[] = [];
    const alwaysVisible = new Set(manifest.always_visible);
    const ownCard = (f: ManifestFrame): boolean => {
        if (alwaysVisible.has(f.key) || (f.protected?.length ?? 0) > 0 || f.identity_resolved === false) return true;
        if (!sameFlags(f.flags_at_freeze, live.get(f.image_id)!)) {
            changed.push(f.image_id);
            return true;
        }
        return false;
    };

    const order = new Map(manifest.frames.map((f, i) => [f.key, i]));
    const cards: { at: number; card: RepresentativeCard }[] = [];
    const single = (f: ManifestFrame) => cards.push({ at: order.get(f.key)!, card: { representativeId: f.image_id, memberIds: [f.image_id] } });
    for (const g of manifest.groups) {
        const rep = byKey.get(g.representative)!;
        ownCard(rep);
        const hidden: ManifestFrame[] = [];
        for (const k of g.members) {
            if (k === g.representative) continue;
            const f = byKey.get(k)!;
            if (ownCard(f)) single(f);
            else hidden.push(f);
        }
        hidden.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
        cards.push({ at: order.get(rep.key)!, card: { representativeId: rep.image_id, memberIds: sharpestFirst([rep, ...hidden]) } });
    }
    for (const k of manifest.singletons) {
        const f = byKey.get(k)!;
        ownCard(f);
        single(f);
    }
    cards.sort((a, b) => a.at - b.at);
    return {
        status: 'ok',
        manifestSha256,
        shootKey: manifest.shoot.key,
        frameCount: manifest.frames.length,
        cards: cards.map((c) => c.card),
        changedSinceFreeze: changed.sort((a, b) => a - b),
        focusById: Object.fromEntries(manifest.frames.filter((f) => isFocus(f.focus)).map((f) => [f.image_id, f.focus as number])),
    };
}
