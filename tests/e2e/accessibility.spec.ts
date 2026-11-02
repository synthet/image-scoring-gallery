import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { clickMenu, openFolderGrid, type E2eEnv, type Launched } from './harness';
import { generateJpegs } from './fixtures';
import { expect, test } from './fixture';

interface Finding { rule: string; html: string }

/** Known defects (#225). They are excluded from the baseline scans and each has its own test.fail below. */
const KNOWN: { rule: string; html: RegExp }[] = [
    { rule: 'button-name', html: /top: 20px; left: 20px/ }, // viewer close button
    { rule: 'color-contrast', html: /colorAllButton/ },
    { rule: 'color-contrast', html: /Folder mode root/ },
    { rule: 'color-contrast', html: />(Unknown|No keywords)</ },
];

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

const unknown = (findings: Finding[]) =>
    findings.filter((f) => !KNOWN.some((k) => k.rule === f.rule && k.html.test(f.html)));

async function openViewer(launched: Launched, env: E2eEnv): Promise<void> {
    await openFolderGrid(launched, env);
    await launched.page.getByText('DSC_0001.JPG').dblclick();
    await expect(launched.page.getByText('Photography Stats')).toBeVisible();
}

test.describe('Journey 5: accessibility', () => {
    test.beforeEach(async ({ env }) => {
        await generateJpegs(path.join(env.photos, '2026-01-19'), 3);
    });

    test('the empty gallery has no new WCAG 2.1 A/AA violations', async ({ launchApp }) => {
        const { page } = await launchApp();
        await expect(page.getByText('(0 items)')).toBeVisible();
        expect(unknown(await scan(page))).toEqual([]);
    });

    test('the folder-mode root dialog has no new WCAG 2.1 A/AA violations', async ({ launchApp }) => {
        const { app, page } = await launchApp();
        await clickMenu(app, ['View', 'Mode: Folder']);
        await page.getByRole('button', { name: /root folder/i }).click();
        await expect(page.getByRole('dialog', { name: /root folder|folder mode/i })).toBeVisible();
        expect(unknown(await scan(page))).toEqual([]);
    });

    test('the folder grid has no new WCAG 2.1 A/AA violations', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openFolderGrid(launched, env);
        expect(unknown(await scan(launched.page))).toEqual([]);
    });

    test('the viewer has no new WCAG 2.1 A/AA violations and Escape closes it', async ({ env, launchApp }) => {
        const launched = await launchApp();
        await openViewer(launched, env);
        expect(unknown(await scan(launched.page))).toEqual([]);
        await launched.page.keyboard.press('Escape');
        await expect(launched.page.getByText('Photography Stats')).toHaveCount(0);
    });

    test('the viewer close button has an accessible name', async ({ env, launchApp }) => {
        test.fail(true, '#225 (1): the viewer close button is icon-only with no accessible name');
        const launched = await launchApp();
        await openViewer(launched, env);
        await expect(launched.page.getByRole('button', { name: /close/i })).toBeVisible({ timeout: 3_000 });
    });

    test('secondary text meets the 4.5:1 contrast ratio', async ({ env, launchApp }) => {
        test.fail(true, '#225 (2-4): Color Label "All", "Folder mode root", and viewer "Unknown"/"No keywords" are below 4.5:1');
        const launched = await launchApp();
        const contrast = async () => (await scan(launched.page)).filter((f) => f.rule === 'color-contrast');
        expect(await contrast(), 'library view').toEqual([]);
        await openViewer(launched, env);
        expect(await contrast(), 'folder mode and viewer').toEqual([]);
    });
});
