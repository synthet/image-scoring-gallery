import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ExifTool } from 'exiftool-vendored';
import type { FileImageMetadataDetail } from './types';
import { getConfigPath } from './config';
import { collapseMalformedThumbnailSegments } from './thumbnailPathNormalize';

/** Verbose `media://` request logging (default off in dev — huge galleries flood the console). */
export function debugGalleryMedia(): boolean {
    return process.env.DEBUG_GALLERY_MEDIA === '1';
}

export const FS_IMAGE_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tif', '.tiff', '.heic', '.heif',
    '.nef', '.nrw', '.cr2', '.cr3', '.arw', '.orf', '.rw2', '.dng',
]);

export function convertFsImagePathForExif(filePath: string): string {
    let convertedPath = filePath;
    if (process.platform === 'win32' && filePath.match(/^\/mnt\/[a-zA-Z]\//)) {
        convertedPath = filePath.replace(/^\/mnt\/([a-zA-Z])\//, '$1:/');
    }
    return convertedPath;
}

/** XMP sidecar wins for these tag names when merging over embedded image tags. */
const XMP_MERGE_KEYS = new Set([
    'Title',
    'ObjectName',
    'Headline',
    'Description',
    'ImageDescription',
    'Caption',
    'Caption-Abstract',
    'CaptionAbstract',
    'Subject',
    'Keywords',
    'HierarchicalSubject',
    'LastKeywordXMP',
    'Rating',
    'XMPRating',
    'Label',
    'ColorLabels',
]);

function tagsToSerializable(tags: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(tags)) {
        const v = tags[key];
        if (v === undefined) continue;
        if (v === null) {
            out[key] = null;
            continue;
        }
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') {
            out[key] = v;
        } else if (Array.isArray(v)) {
            out[key] = v.map((item) =>
                item !== null && typeof item === 'object' ? String(item) : item,
            );
        } else {
            out[key] = String(v);
        }
    }
    return out;
}

export async function readExiftoolAsPlain(
    exiftool: ExifTool,
    filePath: string,
): Promise<Record<string, unknown>> {
    const tags = await exiftool.read(filePath);
    return tagsToSerializable(tags as unknown as Record<string, unknown>);
}

export function mergeXmpOverImage(
    imageTags: Record<string, unknown>,
    xmpTags: Record<string, unknown>,
): Record<string, unknown> {
    const merged = { ...imageTags };
    for (const key of Object.keys(xmpTags)) {
        if (!XMP_MERGE_KEYS.has(key)) continue;
        const v = xmpTags[key];
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        merged[key] = v;
    }
    return merged;
}

export function metadataDetailFromTags(m: Record<string, unknown>): FileImageMetadataDetail {
    const title = [m.Title, m.ObjectName, m.Headline].find(
        (x) => typeof x === 'string' && x.trim(),
    ) as string | undefined;
    const description = [
        m.Description,
        m.ImageDescription,
        m.Caption,
        m['Caption-Abstract'],
        m.CaptionAbstract,
    ].find((x) => typeof x === 'string' && x.trim()) as string | undefined;

    let keywords = '';
    const kw = m.Keywords ?? m.Subject;
    if (Array.isArray(kw)) {
        keywords = kw.map(String).filter(Boolean).join(', ');
    } else if (typeof kw === 'string') {
        keywords = kw;
    }

    let rating = 0;
    const r = m.Rating ?? m.XMPRating;
    if (typeof r === 'number' && !Number.isNaN(r)) {
        rating = Math.max(0, Math.round(r));
    } else if (typeof r === 'string') {
        const n = parseInt(r, 10);
        if (!Number.isNaN(n)) rating = Math.max(0, n);
    }

    const labelRaw = m.Label ?? m.ColorLabels;
    const label = labelRaw !== undefined && labelRaw !== null ? String(labelRaw) : null;

    const iso = m.ISO;
    let exif_iso: number | null = null;
    if (typeof iso === 'number' && !Number.isNaN(iso)) exif_iso = iso;
    else if (typeof iso === 'string') {
        const n = parseFloat(iso);
        exif_iso = Number.isNaN(n) ? null : n;
    }

    let exif_shutter: string | null = null;
    const ss = m.ShutterSpeed ?? m.ExposureTime;
    if (ss !== undefined && ss !== null) exif_shutter = String(ss);

    let exif_aperture: string | null = null;
    const ap = m.Aperture ?? m.FNumber;
    if (ap !== undefined && ap !== null) exif_aperture = String(ap);

    const fl = m.FocalLength;
    const exif_focal_length = fl !== undefined && fl !== null ? String(fl) : null;

    const mod = m.Model ?? m.CameraModelName;
    const exif_model = mod !== undefined && mod !== null ? String(mod) : null;

    const lens = m.LensModel ?? m.Lens;
    const exif_lens_model = lens !== undefined && lens !== null ? String(lens) : null;

    return {
        title: title?.trim() || undefined,
        description: description?.trim() || undefined,
        keywords: keywords || undefined,
        rating,
        label,
        exif_iso,
        exif_shutter,
        exif_aperture,
        exif_focal_length,
        exif_model,
        exif_lens_model,
    };
}

function defaultLightModeRoot(): string {
    const pictures = path.join(os.homedir(), 'Pictures');
    if (process.platform === 'win32') {
        if (fs.existsSync(pictures)) {
            return pictures;
        }
        return 'D:\\Photos';
    }
    return pictures;
}

export function readLightModeRootFromConfig(electronDirname: string): string {
    try {
        const configPath = getConfigPath(electronDirname);
        if (fs.existsSync(configPath)) {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { lightModeRootFolder?: string };
            if (typeof raw.lightModeRootFolder === 'string' && raw.lightModeRootFolder.trim()) {
                return path.resolve(raw.lightModeRootFolder.trim());
            }
        }
    } catch {
        /* ignore */
    }
    return path.resolve(defaultLightModeRoot());
}

export function isPathInsideLightRoot(root: string, target: string): boolean {
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(target);
    if (resolvedTarget === resolvedRoot) {
        return true;
    }
    const rel = path.relative(resolvedRoot, resolvedTarget);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Thumbnails may not exist at the exact path from the DB:
 * - Repo renamed to image-scoring-backend while JPEGs still live under .../image-scoring/thumbnails
 * - DB stores flat thumbnails/<hash>.jpg but on-disk layout is nested thumbnails/<aa>/<hash>.jpg
 */
export function resolveMediaFilePathWithFallbacks(normalizedPath: string): string {
    normalizedPath = collapseMalformedThumbnailSegments(normalizedPath);

    if (fs.existsSync(normalizedPath)) {
        return normalizedPath;
    }

    const tryLegacyRepo = (p: string): string | null => {
        if (/image-scoring-backend/i.test(p)) {
            const alt = p.replace(/image-scoring-backend/gi, 'image-scoring');
            if (alt !== p && fs.existsSync(alt)) {
                return alt;
            }
        }
        return null;
    };

    const legacy = tryLegacyRepo(normalizedPath);
    if (legacy) {
        return legacy;
    }

    const dir = path.dirname(normalizedPath);
    const base = path.basename(normalizedPath);
    const flat = /^([a-f0-9]{32})\.(jpe?g|png)$/i.exec(base);
    if (flat && path.basename(dir).toLowerCase() === 'thumbnails') {
        const hash = flat[1];
        const nested = path.join(dir, hash.slice(0, 2), base);
        if (fs.existsSync(nested)) {
            return nested;
        }
        const nestedLegacy = tryLegacyRepo(nested);
        if (nestedLegacy) {
            return nestedLegacy;
        }
    }

    return normalizedPath;
}
