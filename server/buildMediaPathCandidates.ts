import path from 'path';
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

/**
 * Ordered filesystem paths to try for a decoded /media/* URL. Host/WSL paths from the DB often
 * do not exist inside Linux Docker; the `…/thumbnails/xx/hash.jpg` tail plus `paths.thumbnail_base_dir`
 * (or the default sibling backend folder) fixes that without changing stored rows.
 */
export function buildMediaPathCandidates(
    rawDecodedPath: string,
    projectRoot: string,
    paths: PathsConfigSlice | undefined,
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const pathsCfg = paths || {};

    const push = (p: string) => pushUnique(seen, out, p);

    push(rawDecodedPath);

    const remapped = applyThumbnailPathRemaps(rawDecodedPath, pathsCfg);
    if (remapped !== rawDecodedPath) {
        push(remapped);
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
            push(path.join(configuredBase, tail));
        }
        if (defaultBase !== configuredBase) {
            push(path.join(defaultBase, tail));
        }
    }

    return out;
}
