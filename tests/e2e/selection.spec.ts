import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { openFolderGrid, stubOpenDialog } from './harness';
import { copyJpegs, generateJpegs } from './fixtures';
import { expect, test } from './fixture';

const FOLDER = '2026-01-19';
const COUNT = 6;

const card = (page: Page, name: string): Locator => page.getByTestId('virtuoso-item-list').getByTitle(name);
const selectedCards = (page: Page): Locator => page.locator('[data-grid-selected]');

/** With the selection bar showing, the grid still ends inside the window, so its last row can be reached. */
async function expectGridFitsWindow(page: Page): Promise<void> {
    const { bottom, height } = await page.getByTestId('virtuoso-scroller').evaluate((el) => ({
        bottom: el.getBoundingClientRect().bottom, height: window.innerHeight,
    }));
    expect(bottom, 'the grid runs past the bottom of the window').toBeLessThanOrEqual(height + 1);
}

/** Journey 9 (#239): pick photos in the grid and export their original files. */
test.describe('Journey 9: selection and export', () => {
    test.beforeEach(async ({ env }) => {
        await generateJpegs(path.join(env.photos, FOLDER), COUNT);
    });

    test('Ctrl+click and Shift+click select, Escape clears, and a plain click still opens the photo', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openFolderGrid(launched, env);
        const { page } = launched;

        await card(page, 'DSC_0002.JPG').click({ modifiers: ['ControlOrMeta'] });
        await expect(page.getByText('1 selected')).toBeVisible();
        await expectGridFitsWindow(page);
        await card(page, 'DSC_0004.JPG').click({ modifiers: ['Shift'] });
        await expect(page.getByText('3 selected')).toBeVisible();
        await expect(selectedCards(page)).toHaveCount(3);
        await expect(page.getByRole('button', { name: 'Close viewer' })).toHaveCount(0);

        await card(page, 'DSC_0003.JPG').click({ modifiers: ['ControlOrMeta'] });
        await expect(page.getByText('2 selected')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.getByRole('toolbar', { name: 'Selected photos' })).toHaveCount(0);
        await expect(selectedCards(page)).toHaveCount(0);

        await card(page, 'DSC_0001.JPG').click();
        await expect(page.getByRole('button', { name: 'Close viewer' })).toBeVisible();
    });

    test('Escape clears a selection first, and only the next Escape leaves the folder', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openFolderGrid(launched, env);
        const { page } = launched;
        await card(page, 'DSC_0002.JPG').click({ modifiers: ['ControlOrMeta'] });
        await expect(page.getByText('1 selected')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.getByRole('toolbar', { name: 'Selected photos' })).toHaveCount(0);
        await expect(card(page, 'DSC_0001.JPG')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(card(page, 'DSC_0001.JPG')).toHaveCount(0);
    });

    test('Space toggles the focused photo', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openFolderGrid(launched, env);
        const { page } = launched;

        await page.getByTestId('virtuoso-scroller').locator('..').focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Space');
        await expect(page.getByText('1 selected')).toBeVisible();
        await page.keyboard.press('Space');
        await expect(page.getByRole('toolbar', { name: 'Selected photos' })).toHaveCount(0);
    });

    test('export copies the selected originals, overwrites nothing, and clears the selection', async ({ env, launchApp }) => {
        const dest = path.join(env.root, 'export');
        fs.mkdirSync(dest);
        fs.writeFileSync(path.join(dest, 'DSC_0002.JPG'), 'already here');
        const source = path.join(env.photos, FOLDER);
        const before = fs.readdirSync(source).sort();

        const launched = await launchApp();
        await openFolderGrid(launched, env);
        const { app, page } = launched;
        await card(page, 'DSC_0002.JPG').click({ modifiers: ['ControlOrMeta'] });
        await card(page, 'DSC_0005.JPG').click({ modifiers: ['ControlOrMeta'] });

        await stubOpenDialog(app, [dest]);
        await page.getByRole('button', { name: 'Export originals…' }).click();
        await expect(page.getByRole('toolbar', { name: 'Selected photos' })).toHaveCount(0);

        expect(fs.readdirSync(dest).sort()).toEqual(['DSC_0002 (2).JPG', 'DSC_0002.JPG', 'DSC_0005.JPG']);
        expect(fs.readFileSync(path.join(dest, 'DSC_0002.JPG'), 'utf8')).toBe('already here');
        for (const [copy, original] of [['DSC_0002 (2).JPG', 'DSC_0002.JPG'], ['DSC_0005.JPG', 'DSC_0005.JPG']]) {
            expect(fs.readFileSync(path.join(dest, copy)).equals(fs.readFileSync(path.join(source, original))), copy).toBe(true);
        }
        expect(fs.readdirSync(source).sort(), 'the source folder is untouched').toEqual(before);
    });

    test('cancelling the folder dialog copies nothing and keeps the selection', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openFolderGrid(launched, env);
        const { app, page } = launched;
        await card(page, 'DSC_0002.JPG').click({ modifiers: ['ControlOrMeta'] });

        await stubOpenDialog(app, []);
        await page.getByRole('button', { name: 'Export originals…' }).click();
        await expect(page.getByRole('button', { name: 'Export originals…' })).toBeEnabled();
        await expect(page.getByText('1 selected')).toBeVisible();
    });

    test('library view: select-all exports photos beyond the loaded pages', async ({ env, launchApp }) => {
        const TOTAL = 120; // The library grid loads 50 at a time.
        const library = path.join(env.root, 'library');
        copyJpegs(library, TOTAL);
        const names = fs.readdirSync(library).sort();
        const rows = names.map((name, i) => ({ id: i + 1, file_path: path.join(library, name), file_name: name }));
        env.backend.onSql((sql, params) => {
            if (/FROM folders WHERE path/i.test(sql)) return String(params[0]).endsWith('/library') ? [{ id: 1 }] : [];
            if (/as "count" FROM images/i.test(sql)) return [{ count: TOTAL }];
            if (/FROM images i\b[\s\S]*LIMIT/i.test(sql)) {
                const [limit, offset] = params.slice(-2).map(Number);
                return rows.slice(offset, offset + limit);
            }
            return undefined;
        });
        const dest = path.join(env.root, 'export');
        fs.mkdirSync(dest);

        const { app, page } = await launchApp();
        await expect(card(page, names[0])).toBeVisible();
        await page.getByTestId('virtuoso-scroller').locator('..').focus();
        await page.keyboard.press('ControlOrMeta+A');
        await expect(page.getByText(`${TOTAL} selected`)).toBeVisible();
        await expectGridFitsWindow(page);

        await stubOpenDialog(app, [dest]);
        await page.getByRole('button', { name: 'Export originals…' }).click();
        await expect(page.getByRole('toolbar', { name: 'Selected photos' })).toHaveCount(0, { timeout: 30_000 });
        expect(fs.readdirSync(dest).sort()).toEqual(names);
    });

    test('the renderer cannot export a file outside the gallery', async ({ env, launchApp }) => {
        const outside = path.join(env.root, 'private.jpg');
        fs.copyFileSync(path.join(env.photos, FOLDER, 'DSC_0001.JPG'), outside);
        const dest = path.join(env.root, 'export');
        fs.mkdirSync(dest);

        const launched = await launchApp();
        await openFolderGrid(launched, env);
        const { app, page } = launched;
        await stubOpenDialog(app, [dest]);
        const result = await page.evaluate((file) => {
            const api = (window as unknown as { electron: { exportOriginals: (p: string[]) => Promise<{ copied: number }> } }).electron;
            return api.exportOriginals([file]);
        }, outside);

        expect(result.copied).toBe(0);
        expect(fs.readdirSync(dest)).toEqual([]);
    });
});
