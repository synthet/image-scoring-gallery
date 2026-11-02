/**
 * Keep-one review: a read-only, library-wide view of keep-one proposals from a study export
 * (`driftara-keepone-review/1`, written by image-scoring-skills `keepone_export`).
 *
 * Each cluster shows its keeper and the frames proposed for soft-cull, with the frozen scores and
 * catalog flags next to the live catalog state. Nothing is applied: the view never writes ratings,
 * labels, flags or files. A frame whose image id is no longer in the catalog shows as missing
 * instead of breaking the view.
 *
 * Pure: no Electron, filesystem or database imports, so it is shared by main-process IPC and tests.
 */

export const KEEPONE_REVIEW_SCHEMA = 'driftara-keepone-review/1';

export type KeepOneReviewFallbackReason = 'cancelled' | 'unreadable' | 'invalid_manifest';

export interface KeepOneLiveRow {
    id: number;
    rating?: number | null;
    label?: string | null;
    pick_status?: number | null;
    file_path?: string | null;
    thumbnail_path?: string | null;
}

export interface KeepOneFlags {
    rating: number | null;
    label: string | null;
    pick_status: number | null;
}

export interface KeepOneFrame {
    imageId: number;
    file: string;
    captureTime: string | null;
    iso: number | null;
    afState: string | null;
    scores: { focus: number | null; noise: number | null; eye: number | null; exposure: number | null };
    flagsAtFreeze: KeepOneFlags;
    /** Live catalog flags; null when the image is no longer in the catalog. */
    live: KeepOneFlags | null;
    /** Rating, label or pick status differ from the freeze (a user edit since the run). */
    changedSinceFreeze: boolean;
    thumbnailPath: string | null;
    filePath: string | null;
}

export interface KeepOneRemoval extends KeepOneFrame {
    basis: string | null;
    tie: boolean;
    jev: { choice: string | null; confidence: number | null; model: string | null } | null;
}

export interface KeepOneCluster {
    shoot: string;
    cluster: number;
    keeper: KeepOneFrame;
    removed: KeepOneRemoval[];
}

export interface KeepOneShoot {
    shoot: string;
    folder: string | null;
    camera: string | null;
    run: string | null;
    frames: number | null;
    bytes: number | null;
    clusters: KeepOneCluster[];
}

export type KeepOneReviewResult =
    | {
        status: 'ok';
        manifestSha256: string;
        totals: { shoots: number; clusters: number; removed: number; frames: number; bytes: number };
        shoots: KeepOneShoot[];
        /** Image ids in the export that are no longer in the catalog. */
        missingIds: number[];
    }
    | { status: 'fallback'; reason: KeepOneReviewFallbackReason; detail: string };

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function invalid(detail: string): KeepOneReviewResult {
    return { status: 'fallback', reason: 'invalid_manifest', detail };
}

/** Every image id the export references (keepers and removals), in order of first appearance. */
export function keepOneImageIds(json: unknown): number[] {
    const ids: number[] = [];
    const seen = new Set<number>();
    if (!isObject(json) || !Array.isArray(json.shoots)) return ids;
    for (const shoot of json.shoots) {
        for (const cluster of (isObject(shoot) && Array.isArray(shoot.clusters) ? shoot.clusters : [])) {
            if (!isObject(cluster)) continue;
            const frames = [cluster.keeper, ...(Array.isArray(cluster.removed) ? cluster.removed : [])];
            for (const f of frames) {
                const id = isObject(f) ? num(f.image_id) : null;
                if (id !== null && !seen.has(id)) {
                    seen.add(id);
                    ids.push(id);
                }
            }
        }
    }
    return ids;
}

function flagsOf(source: Json | KeepOneLiveRow): KeepOneFlags {
    const s = source as Json;
    return { rating: num(s.rating), label: str(s.label), pick_status: num(s.pick_status) };
}

function frameOf(raw: Json, live: Map<number, KeepOneLiveRow>): KeepOneFrame | null {
    const imageId = num(raw.image_id);
    if (imageId === null || !Number.isInteger(imageId)) return null;
    const scores = isObject(raw.scores) ? raw.scores : {};
    const frozen = flagsOf(isObject(raw.flags_at_freeze) ? raw.flags_at_freeze : {});
    const row = live.get(imageId);
    const liveFlags = row ? flagsOf(row) : null;
    // pick_status is compared only when both sides report it (older catalogs lack the column).
    const changed = !!liveFlags && (
        liveFlags.rating !== frozen.rating
        || (liveFlags.label ?? '') !== (frozen.label ?? '')
        || (liveFlags.pick_status !== null && frozen.pick_status !== null && liveFlags.pick_status !== frozen.pick_status)
    );
    return {
        imageId,
        file: str(raw.file) ?? `#${imageId}`,
        captureTime: str(raw.capture_time),
        iso: num(raw.iso),
        afState: str(raw.af_state),
        scores: { focus: num(scores.focus), noise: num(scores.noise), eye: num(scores.eye), exposure: num(scores.exposure) },
        flagsAtFreeze: frozen,
        live: liveFlags,
        changedSinceFreeze: changed,
        thumbnailPath: row?.thumbnail_path ?? null,
        filePath: row?.file_path ?? null,
    };
}

/** Validates the export and joins it with live catalog rows. Never throws on bad input. */
export function buildKeepOneReview(json: unknown, manifestSha256: string, liveRows: KeepOneLiveRow[]): KeepOneReviewResult {
    if (!isObject(json)) return invalid('export is not a JSON object');
    if (json.schema !== KEEPONE_REVIEW_SCHEMA) {
        return invalid(`unsupported schema ${String(json.schema)}; expected ${KEEPONE_REVIEW_SCHEMA}`);
    }
    if (!Array.isArray(json.shoots)) return invalid('export has no shoots list');

    const live = new Map(liveRows.map((r) => [r.id, r]));
    const shoots: KeepOneShoot[] = [];
    const totals = { shoots: 0, clusters: 0, removed: 0, frames: 0, bytes: 0 };
    for (const rawShoot of json.shoots) {
        if (!isObject(rawShoot) || typeof rawShoot.shoot !== 'string' || !Array.isArray(rawShoot.clusters)) {
            return invalid('a shoot entry is missing its key or clusters');
        }
        const counts = isObject(rawShoot.counts) ? rawShoot.counts : {};
        const clusters: KeepOneCluster[] = [];
        for (const rawCluster of rawShoot.clusters) {
            if (!isObject(rawCluster) || !isObject(rawCluster.keeper) || !Array.isArray(rawCluster.removed)) {
                return invalid(`shoot ${rawShoot.shoot}: a cluster is missing its keeper or removals`);
            }
            const keeper = frameOf(rawCluster.keeper, live);
            if (!keeper) return invalid(`shoot ${rawShoot.shoot}: a keeper has no image id`);
            const removed: KeepOneRemoval[] = [];
            for (const rawRemoved of rawCluster.removed) {
                const frame = isObject(rawRemoved) ? frameOf(rawRemoved, live) : null;
                if (!frame || !isObject(rawRemoved)) return invalid(`shoot ${rawShoot.shoot}: a removal has no image id`);
                const jev = isObject(rawRemoved.jev)
                    ? { choice: str(rawRemoved.jev.choice), confidence: num(rawRemoved.jev.confidence), model: str(rawRemoved.jev.model) }
                    : null;
                removed.push({ ...frame, basis: str(rawRemoved.basis), tie: rawRemoved.tie === true, jev });
            }
            clusters.push({ shoot: rawShoot.shoot, cluster: num(rawCluster.cluster) ?? clusters.length, keeper, removed });
            totals.removed += removed.length;
        }
        totals.shoots += 1;
        totals.clusters += clusters.length;
        totals.frames += num(counts.frames) ?? 0;
        totals.bytes += num(counts.bytes) ?? 0;
        shoots.push({
            shoot: rawShoot.shoot,
            folder: str(rawShoot.folder),
            camera: str(rawShoot.camera),
            run: str(rawShoot.run),
            frames: num(counts.frames),
            bytes: num(counts.bytes),
            clusters,
        });
    }
    const missingIds = keepOneImageIds(json).filter((id) => !live.has(id));
    return { status: 'ok', manifestSha256, totals, shoots, missingIds };
}
