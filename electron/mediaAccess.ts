import path from 'path';
import { isPathInsideLightRoot } from './fsMetadataHelpers';

/**
 * Which files the media:// protocol may serve (#237). A script in the renderer must not be able to
 * read images from anywhere on disk, so a file has to belong to the gallery:
 * - under an allowed root (the thumbnail folders, the folder-mode root), or
 * - in a library folder, or a known library image, according to the database.
 *
 * Roots compare real paths, so a link can't lead out of one. The database lookups use the path as
 * requested, because the database stores paths as the backend saw them, junctions included. Confirmed
 * library folders are cached; refusals are not, so a folder imported a moment ago works. When the
 * database can't answer, only folders it has already confirmed are allowed.
 */
export interface MediaAccessDeps {
    /** Read on every request: the folder-mode root can change while the app runs. */
    allowedRoots: () => string[];
    isLibraryFolder: (dir: string) => Promise<boolean>;
    isLibraryFile: (file: string) => Promise<boolean>;
    realPath: (p: string) => Promise<string>;
}

/** Older names of the backend checkout; thumbnails can still live there (see resolveMediaFilePathWithFallbacks). */
const BACKEND_REPO_NAMES = ['image-scoring-pipeline', 'image-scoring-backend', 'image-scoring'];

export function thumbnailRoots(projectRoot: string, thumbnailBaseDir: string | undefined): string[] {
    const roots = BACKEND_REPO_NAMES.map((name) => path.resolve(projectRoot, '..', name, 'thumbnails'));
    const configured = thumbnailBaseDir?.trim();
    if (configured) roots.push(path.resolve(projectRoot, configured));
    return roots;
}

export function createMediaAccess(deps: MediaAccessDeps): (filePath: string) => Promise<boolean> {
    const libraryFolders = new Set<string>();

    /** The real path, or the path as given for something that doesn't exist (the fetch then answers 404). */
    const real = (p: string) => deps.realPath(p).catch(() => p);

    const isUnderAllowedRoot = async (file: string): Promise<boolean> => {
        for (const root of deps.allowedRoots()) {
            if (isPathInsideLightRoot(await real(root), file)) return true;
        }
        return false;
    };

    return async (filePath) => {
        if (await isUnderAllowedRoot(await real(filePath))) return true;

        const dir = path.dirname(filePath);
        if (libraryFolders.has(dir)) return true;
        try {
            if (await deps.isLibraryFolder(dir)) {
                libraryFolders.add(dir);
                return true;
            }
            return await deps.isLibraryFile(filePath);
        } catch (e) {
            console.warn('[Main] Media access check failed:', e instanceof Error ? e.message : e);
            return false;
        }
    };
}
