import path from 'path';
import { crossOsFilePathCandidates } from '../electron/pathWinWsl';
import { absolutizeThumbnailPath, extractThumbnailTail } from '../electron/thumbnailPathNormalize';
import { applyThumbnailPathRemaps, type PathsConfigSlice } from '../electron/pathsRemap';

function pushUnique(seen: Set<string>, out: string[], candidate: string): void {
    try {
        const n = path.normalize(candidate);
        if (!seen.has(n)) {
            seen.add(n);
            out.push(n);
        }
    } catch {
        /* ignore */
    }
}

function resolveThumbnailBase(projectRoot: string, pathsCfg: PathsConfigSlice): string | undefined {
    const raw = pathsCfg.thumbnail_base_dir?.trim();
    if (!raw) return undefined;
    return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectRoot, raw);
}

/** DB may store legacy flat `thumbnails/{hash}.jpg` while files use nested `thumbnails/{aa}/{hash}.jpg`. */
function pushThumbnailUnderBase(base: string, tail: string, push: (p: string) => void): void {
    push(path.join(base, tail));
    const normTail = tail.replace(/\\/g, '/');
    if (normTail.includes('/')) return;
    const baseName = normTail.split('/').pop() ?? normTail;
    const m = /^([0-9a-f]+)\.(jpg|jpeg|png|webp)$/i.exec(baseName);
    if (!m) return;
    const stem = m[1];
    // Long hex stems only (thumbnail content hashes); avoids junk like ab.jpg → ab/ab.jpg
    if (stem.length < 16) return;
    const shard = stem.slice(0, 2).toLowerCase();
    push(path.join(base, shard, baseName));
}

/**
 * Ordered filesystem paths to try for a decoded /media/* URL. Host/WSL paths from the DB often
 * do not exist inside Linux Docker; the `…/thumbnails/xx/hash.jpg` tail plus `paths.thumbnail_base_dir`
 * (or the default sibling backend folder) fixes that without changing stored rows.
 */
export type BuildMediaPathCandidatesOptions = {
    /** Override host OS (tests: assert WSL↔Windows variants on Linux CI). */
    hostPlatform?: NodeJS.Platform;
};

export function buildMediaPathCandidates(
    rawDecodedPath: string,
    projectRoot: string,
    paths: PathsConfigSlice | undefined,
    opts?: BuildMediaPathCandidatesOptions,
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const pathsCfg = paths || {};
    const platformOpt = opts?.hostPlatform ? { forPlatform: opts.hostPlatform } : undefined;

    const push = (p: string) => pushUnique(seen, out, p);

    for (const v of crossOsFilePathCandidates(rawDecodedPath, platformOpt)) {
        push(v);
    }

    const remapped = applyThumbnailPathRemaps(rawDecodedPath, pathsCfg);
    if (remapped !== rawDecodedPath) {
        for (const v of crossOsFilePathCandidates(remapped, platformOpt)) {
            push(v);
        }
    }

    const absolutized = absolutizeThumbnailPath(
        remapped,
        projectRoot,
        pathsCfg.thumbnail_base_dir?.trim() || undefined,
    );
    push(absolutized);

    const configuredBase = resolveThumbnailBase(projectRoot, pathsCfg);
    const defaultBase = path.resolve(projectRoot, '../image-scoring-backend/thumbnails');

    for (const source of [rawDecodedPath, remapped]) {
        const tail = extractThumbnailTail(source);
        if (!tail) continue;
        if (configuredBase) {
            pushThumbnailUnderBase(configuredBase, tail, push);
        }
        if (defaultBase !== configuredBase) {
            pushThumbnailUnderBase(defaultBase, tail, push);
        }
    }

    return out;
}
