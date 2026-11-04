import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { createMediaAccess, thumbnailRoots, type MediaAccessDeps } from './mediaAccess';

const ROOT = path.resolve('/photos/root');
const THUMBS = path.resolve('/app/thumbnails');

function deps(over: Partial<MediaAccessDeps> = {}): MediaAccessDeps {
    return {
        allowedRoots: () => [ROOT, THUMBS],
        isLibraryFolder: vi.fn().mockResolvedValue(false),
        isLibraryFile: vi.fn().mockResolvedValue(false),
        realPath: async (p) => p,
        ...over,
    };
}

describe('createMediaAccess (#237)', () => {
    it('allows files under an allowed root without asking the database', async () => {
        const d = deps();
        const allowed = createMediaAccess(d);
        expect(await allowed(path.join(ROOT, '2026', 'DSC_0001.JPG'))).toBe(true);
        expect(await allowed(path.join(THUMBS, 'ab', 'abc.jpg'))).toBe(true);
        expect(d.isLibraryFolder).not.toHaveBeenCalled();
    });

    it('refuses an image outside every root and library folder', async () => {
        const allowed = createMediaAccess(deps());
        expect(await allowed(path.resolve('/somewhere/else/private.jpg'))).toBe(false);
    });

    it('refuses a sibling folder that only shares the root as a name prefix', async () => {
        const allowed = createMediaAccess(deps());
        expect(await allowed(path.resolve('/photos/root-private/DSC_0001.JPG'))).toBe(false);
    });

    it('allows a file whose parent is a library folder, and caches the folder', async () => {
        const isLibraryFolder = vi.fn().mockResolvedValue(true);
        const allowed = createMediaAccess(deps({ isLibraryFolder }));
        const dir = path.resolve('/library/2026');
        expect(await allowed(path.join(dir, 'a.nef'))).toBe(true);
        expect(await allowed(path.join(dir, 'b.nef'))).toBe(true);
        expect(isLibraryFolder).toHaveBeenCalledTimes(1);
    });

    it('does not cache a refusal: a folder imported later is allowed', async () => {
        const isLibraryFolder = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
        const allowed = createMediaAccess(deps({ isLibraryFolder }));
        const file = path.resolve('/library/new/a.jpg');
        expect(await allowed(file)).toBe(false);
        expect(await allowed(file)).toBe(true);
    });

    it('allows a known image whose parent has no folder row', async () => {
        const isLibraryFile = vi.fn().mockResolvedValue(true);
        const allowed = createMediaAccess(deps({ isLibraryFile }));
        expect(await allowed(path.resolve('/exports/keepone/a.jpg'))).toBe(true);
    });

    it('follows links: a link inside a root to a file outside it is refused', async () => {
        const inside = path.join(ROOT, 'link.jpg');
        const outside = path.resolve('/private/target.jpg');
        const allowed = createMediaAccess(deps({ realPath: async (p) => (p === inside ? outside : p) }));
        expect(await allowed(inside)).toBe(false);
    });

    it('asks the database about the path as requested, so a library reached through a junction still works', async () => {
        const viaJunction = path.resolve('/junction/library/a.jpg');
        const isLibraryFolder = vi.fn(async (dir: string) => dir === path.dirname(viaJunction));
        const allowed = createMediaAccess(deps({
            isLibraryFolder,
            realPath: async (p) => p.replace(path.resolve('/junction'), path.resolve('/real')),
        }));
        expect(await allowed(viaJunction)).toBe(true);
    });

    it('compares roots by their real path too', async () => {
        const realRoot = path.resolve('/mnt/real/photos');
        const allowed = createMediaAccess(deps({
            realPath: async (p) => (p.startsWith(ROOT) ? p.replace(ROOT, realRoot) : p),
        }));
        expect(await allowed(path.join(ROOT, 'a.jpg'))).toBe(true);
    });

    it('checks the path as given when the file does not exist (the fetch then 404s)', async () => {
        const allowed = createMediaAccess(deps({
            realPath: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
        }));
        expect(await allowed(path.join(ROOT, 'gone.jpg'))).toBe(true);
        expect(await allowed(path.resolve('/elsewhere/gone.jpg'))).toBe(false);
    });

    it('refuses when the database cannot answer, but keeps folders it already confirmed', async () => {
        const isLibraryFolder = vi.fn().mockResolvedValueOnce(true).mockRejectedValue(new Error('db down'));
        const isLibraryFile = vi.fn().mockRejectedValue(new Error('db down'));
        const allowed = createMediaAccess(deps({ isLibraryFolder, isLibraryFile }));
        const known = path.resolve('/library/known/a.jpg');
        expect(await allowed(known)).toBe(true);
        expect(await allowed(path.resolve('/library/known/b.jpg'))).toBe(true);
        expect(await allowed(path.resolve('/library/other/c.jpg'))).toBe(false);
    });
});

describe('thumbnailRoots (#237)', () => {
    const projectRoot = path.resolve('/projects/image-scoring-gallery');
    const sibling = (name: string) => path.resolve(projectRoot, '..', name, 'thumbnails');

    it('includes the sibling backend folders, under their current and older names', () => {
        expect(thumbnailRoots(projectRoot, undefined)).toEqual(expect.arrayContaining([
            sibling('image-scoring-pipeline'), sibling('image-scoring-backend'), sibling('image-scoring'),
        ]));
    });

    it('adds a configured thumbnail_base_dir, relative to the app root when relative', () => {
        expect(thumbnailRoots(projectRoot, path.resolve('/data/thumbs'))).toContain(path.resolve('/data/thumbs'));
        expect(thumbnailRoots(projectRoot, '../shared/thumbs')).toContain(path.resolve(projectRoot, '../shared/thumbs'));
    });
});
