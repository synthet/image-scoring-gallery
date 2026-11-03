import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import type { FakeBackend } from './fakeBackend';
import { clickMenu, stubOpenDialog } from './harness';
import { copyJpegs } from './fixtures';
import { expect, test } from './fixture';

/**
 * Journey 8 covers import, the long operation that runs end to end against the fake backend.
 * Sync reads only Nikon .nef files and backup selects photos by score from the database, so neither
 * can run on generated fixtures without faking camera files or backend query results; see
 * docs/testing/e2e.md.
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
});
