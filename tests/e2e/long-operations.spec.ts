import fs from 'node:fs';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import type { FakeBackend } from './fakeBackend';
import { clickMenu, stubOpenDialog, type E2eEnv } from './harness';
import { copyJpegs, generateNefNamedPhotos } from './fixtures';
import { expect, test } from './fixture';

/**
 * Journey 8 covers import and sync end to end against the fake backend. Backup selects photos by score
 * from the database, so it can't run without faking backend query results; see
 * docs/guides/06-e2e-testing.md.
 */

/** Answers the import's two INSERT ... RETURNING id statements with fresh ids and records each image insert. */
function recordImports(backend: FakeBackend, failFor?: string): { files: string[] } {
    const recorded = { files: [] as string[] };
    let nextId = 1_000;
    backend.onSql((sql, params) => {
        if (/^\s*INSERT INTO folders/i.test(sql)) return [{ id: nextId++ }];
        if (/^\s*INSERT INTO images/i.test(sql)) {
            const fileName = String(params[1]);
            if (fileName === failFor) throw new Error(`simulated insert failure for ${fileName}`);
            recorded.files.push(fileName);
            return [{ id: nextId++ }];
        }
        return undefined;
    });
    return recorded;
}

/** Starts File › Import on `folder` through the (stubbed) folder dialog and records progress events. */
async function startImport(app: ElectronApplication, page: Page, folder: string): Promise<void> {
    await page.evaluate(() => {
        const w = window as unknown as {
            __importProgress: { current: number; total: number }[];
            electron: { onImportProgress: (cb: (d: { current: number; total: number }) => void) => void };
        };
        w.__importProgress = [];
        w.electron.onImportProgress((d) => { w.__importProgress.push({ current: d.current, total: d.total }); });
    });
    await stubOpenDialog(app, [folder]);
    await clickMenu(app, ['File', 'Import']);
    await expect(page.getByRole('heading', { name: 'Import folder' })).toBeVisible();
}

const progressEvents = (page: Page) =>
    page.evaluate(() => (window as unknown as { __importProgress: { current: number; total: number }[] }).__importProgress);

/** Points sync at a destination inside the test's temp root. */
function setSyncDestination(env: E2eEnv): string {
    const dest = path.join(env.root, 'library');
    const config = JSON.parse(fs.readFileSync(env.configPath, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(env.configPath, JSON.stringify({ ...config, sync: { destinationRoot: dest } }, null, 2));
    return dest;
}

/** Every file under `dir`, recursively, as absolute paths. */
function filesUnder(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((e) => e.isFile())
        .map((e) => path.join(e.parentPath, e.name));
}

/** A fake database for sync: remembers inserted images, so a second run sees them as already indexed. */
function recordSyncedImages(backend: FakeBackend): { names: string[] } {
    const paths = new Map<string, number>();
    const recorded = { names: [] as string[] };
    let nextId = 1_000;
    backend.onSql((sql, params) => {
        if (/^\s*INSERT INTO folders/i.test(sql)) return [{ id: nextId++ }];
        if (/^\s*INSERT INTO images/i.test(sql)) {
            const id = nextId++;
            paths.set(String(params[0]), id);
            recorded.names.push(String(params[1]));
            return [{ id }];
        }
        if (/SELECT id FROM images WHERE file_path/i.test(sql)) {
            const id = paths.get(String(params[0]));
            return id === undefined ? [] : [{ id }];
        }
        return undefined;
    });
    return recorded;
}

/** File › Sync on `source` through the (stubbed) folder dialog, up to the finished preview. */
async function openSyncPreview(app: ElectronApplication, page: Page, source: string): Promise<void> {
    await stubOpenDialog(app, [source]);
    await clickMenu(app, ['File', 'Sync']);
    await expect(page.getByRole('heading', { name: 'Sync from device' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start sync' })).toBeVisible({ timeout: 60_000 });
}

/** The copy in the library has the same bytes as the source photo of that name. */
function expectCopiesMatch(source: string, copies: string[]): void {
    for (const copy of copies) {
        expect(fs.readFileSync(copy).equals(fs.readFileSync(path.join(source, path.basename(copy)))), copy).toBe(true);
    }
}

test.describe('Journey 8: long operations', () => {
    const COUNT = 25;

    test('import reports progress for every photo and records each one exactly once', async ({ env, launchApp }) => {
        const folder = path.join(env.photos, 'to-import');
        const files = copyJpegs(folder, COUNT);
        const recorded = recordImports(env.backend);
        const { app, page } = await launchApp();

        await startImport(app, page, folder);
        await expect(page.getByText(`Completed: ${COUNT} files`)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(`Added: ${COUNT} · Skipped: 0`)).toBeVisible();

        const progress = await progressEvents(page);
        expect(progress.map((p) => p.current)).toEqual(Array.from({ length: COUNT }, (_, i) => i + 1));
        expect(new Set(progress.map((p) => p.total))).toEqual(new Set([COUNT]));
        expect([...recorded.files].sort()).toEqual(files);
    });

    test('a failed photo is reported and the rest of the import still completes consistently', async ({ env, launchApp }) => {
        const folder = path.join(env.photos, 'to-import');
        const files = copyJpegs(folder, COUNT);
        const recorded = recordImports(env.backend, 'DSC_0003.JPG');
        const { app, page } = await launchApp();

        await startImport(app, page, folder);
        await expect(page.getByText(`Completed: ${COUNT} files`)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(`Added: ${COUNT - 1} · Skipped: 0`)).toBeVisible();
        await expect(page.getByText('Errors:')).toBeVisible();
        await expect(page.getByText(/^DSC_0003\.JPG: /)).toBeVisible();

        // Every other photo was recorded once, the failed one not at all, and progress still reached the end.
        expect([...recorded.files].sort()).toEqual(files.filter((f) => f !== 'DSC_0003.JPG'));
        const progress = await progressEvents(page);
        expect(progress.at(-1)).toEqual({ current: COUNT, total: COUNT });
        // The dialog can be closed once the run has finished.
        await page.getByTitle('Close').click();
        await expect(page.getByRole('heading', { name: 'Import folder' })).toHaveCount(0);
    });

    test('a running import can be cancelled and keeps what it imported', async ({ env, launchApp }) => {
        const folder = path.join(env.photos, 'to-import');
        copyJpegs(folder, 400);
        const recorded = recordImports(env.backend);
        const { app, page } = await launchApp();

        await startImport(app, page, folder);
        await expect(page.getByText(/^Processing \d+ of 400$/)).toBeVisible({ timeout: 10_000 });
        await page.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 3_000 });
        await expect(page.getByText(/^Import cancelled after \d+ of 400 files/)).toBeVisible({ timeout: 15_000 });

        // Consistent state: the "Added" count matches what reached the database, each photo once,
        // and the import stopped well before the end.
        const summary = await page.getByText(/^Added: \d+ · Skipped: \d+/).textContent();
        const added = Number(/Added: (\d+)/.exec(summary ?? '')?.[1]);
        expect(recorded.files).toHaveLength(added);
        expect(new Set(recorded.files).size).toBe(added);
        expect(added).toBeLessThan(400);
        // The Cancel button is gone and the dialog can be closed.
        await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
        await page.getByTitle('Close').click();
        await expect(page.getByRole('heading', { name: 'Import folder' })).toHaveCount(0);
    });

    test('sync copies every photo intact and records each one once', async ({ env, launchApp }) => {
        const source = path.join(env.root, 'card');
        const files = await generateNefNamedPhotos(source, COUNT);
        const dest = setSyncDestination(env);
        const recorded = recordSyncedImages(env.backend);
        const { app, page } = await launchApp();

        await openSyncPreview(app, page, source);
        await page.getByRole('button', { name: 'Start sync' }).click();
        await expect(page.getByText(/^Copied:/)).toBeVisible({ timeout: 60_000 });

        const copies = filesUnder(dest);
        expect(copies.map((f) => path.basename(f)).sort()).toEqual(files);
        expectCopiesMatch(source, copies);
        expect([...recorded.names].sort()).toEqual(files);
    });

    test('a running sync can be cancelled, leaves no partial files, and the next sync copies the rest', async ({ env, launchApp }) => {
        const TOTAL = 300;
        const source = path.join(env.root, 'card');
        const files = await generateNefNamedPhotos(source, TOTAL);
        const dest = setSyncDestination(env);
        const recorded = recordSyncedImages(env.backend);
        const { app, page } = await launchApp();

        await openSyncPreview(app, page, source);
        env.backend.slowQueries(40); // Tiny fixture files copy almost instantly; give Cancel a window.
        await page.getByRole('button', { name: 'Start sync' }).click();
        await expect(page.getByRole('heading', { name: 'Sync from device' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => filesUnder(dest).length, { timeout: 30_000 }).toBeGreaterThan(0);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 3_000 });
        await expect(page.getByText(/^Sync cancelled\./)).toBeVisible({ timeout: 60_000 });
        env.backend.slowQueries(0);

        // Consistent on disk and in the database: whole photos only, each with its row.
        const copied = filesUnder(dest);
        expect(copied.filter((f) => f.endsWith('.part'))).toEqual([]);
        expect(copied.length).toBeGreaterThan(0);
        expect(copied.length).toBeLessThan(TOTAL);
        expectCopiesMatch(source, copied);
        expect([...recorded.names].sort()).toEqual(copied.map((f) => path.basename(f)).sort());

        // Sync again: the rest of the same date folder is copied, nothing twice.
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Sync from device' })).toHaveCount(0);
        await openSyncPreview(app, page, source);
        await page.getByRole('button', { name: 'Start sync' }).click();
        await expect(page.getByText(/^Copied:/)).toBeVisible({ timeout: 60_000 });

        const all = filesUnder(dest);
        expect(all.map((f) => path.basename(f)).sort()).toEqual(files);
        expectCopiesMatch(source, all);
        expect([...recorded.names].sort()).toEqual(files);
    });
});
