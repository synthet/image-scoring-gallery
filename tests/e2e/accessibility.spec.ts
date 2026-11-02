import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { clickMenu, openFolderGrid, type E2eEnv, type Launched } from './harness';
import { generateJpegs } from './fixtures';
import { expect, test } from './fixture';

interface Finding { rule: string; html: string }

/**
 * WCAG 2.1 A/AA scan of the current page. Legacy mode runs axe inside the page; the default mode opens a
 * helper page, which Electron does not support.
 */
async function scan(page: Page): Promise<Finding[]> {
    const result = await new AxeBuilder({ page })
        .setLegacyMode(true)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
    return result.violations.flatMap((v) => v.nodes.map((n) => ({ rule: v.id, html: n.html.slice(0, 200) })));
}

async function openViewer(launched: Launched, env: E2eEnv): Promise<void> {
    await openFolderGrid(launched, env);
    await launched.page.getByText('DSC_0001.JPG').dblclick();
    await expect(launched.page.getByText('Photography Stats')).toBeVisible();
}

test.describe('Journey 5: accessibility', () => {
    test.beforeEach(async ({ env }) => {
        await generateJpegs(path.join(env.photos, '2026-01-19'), 3);
    });

    test('the empty gallery has no WCAG 2.1 A/AA violations', async ({ launchApp }) => {
        const { page } = await launchApp();
        await expect(page.getByText('(0 items)')).toBeVisible();
        expect(await scan(page)).toEqual([]);
    });

    test('the folder-mode root dialog has no WCAG 2.1 A/AA violations', async ({ launchApp }) => {
        const { app, page } = await launchApp();
        await clickMenu(app, ['View', 'Mode: Folder']);
        await page.getByRole('button', { name: /root folder/i }).click();
        await expect(page.getByRole('dialog', { name: /root folder|folder mode/i })).toBeVisible();
        expect(await scan(page)).toEqual([]);
    });

    test('the folder grid has no WCAG 2.1 A/AA violations', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openFolderGrid(launched, env);
        expect(await scan(launched.page)).toEqual([]);
    });

    test('the viewer has no WCAG 2.1 A/AA violations and Escape closes it', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openViewer(launched, env);
        expect(await scan(launched.page)).toEqual([]);
        await launched.page.keyboard.press('Escape');
        await expect(launched.page.getByText('Photography Stats')).toHaveCount(0);
    });

    test('the viewer close button has an accessible name', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openViewer(launched, env);
        await expect(launched.page.getByRole('button', { name: /close/i })).toBeVisible({ timeout: 3_000 });
    });

    test('secondary text meets the 4.5:1 contrast ratio', async ({ env, launchApp }) => {
        const launched = await launchApp();
        const contrast = async () => (await scan(launched.page)).filter((f) => f.rule === 'color-contrast');
        expect(await contrast(), 'library view').toEqual([]);
        await openViewer(launched, env);
        expect(await contrast(), 'folder mode and viewer').toEqual([]);
    });
});
