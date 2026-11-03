import path from 'node:path';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { openFolderGrid } from './harness';
import { generateJpegs } from './fixtures';
import { expect, test } from './fixture';

/** Sets the main window's content (viewport) size in DIPs and waits for the page to see it. */
async function resize(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [width, height]);
    // Electron may round the content size by one DIP.
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(width + 1);
}

/** The page never scrolls sideways: everything fits the viewport width. */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, 'horizontal page overflow').toBeLessThanOrEqual(innerWidth);
}

/** The element is inside the viewport and is what a click at its centre would hit (not covered by an overlay). */
async function expectUncovered(locator: Locator, what: string): Promise<void> {
    await expect(locator, what).toBeVisible();
    const hit = await locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const inViewport = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
        const top = document.elementFromPoint(x, y);
        return { inViewport, onTop: !!top && (el === top || el.contains(top)) };
    });
    expect(hit, `${what} is in the viewport and not covered`).toEqual({ inViewport: true, onTop: true });
}

test.describe('Journey 6: layout at small sizes and 150% scaling', () => {
    for (const [width, height] of [[1024, 640], [800, 600], [640, 480]] as const) {
        test(`library view at ${width}x${height}: the sidebar collapses and the header stays usable`, async ({ launchApp }) => {
            const { app, page } = await launchApp();
            await resize(app, page, width, height);
            const toggle = page.getByRole('button', { name: 'Toggle filters sidebar' });
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
            await expectUncovered(toggle, 'sidebar toggle');
            await expectUncovered(page.getByRole('heading', { name: 'Image Gallery' }), 'gallery title');
            await expectUncovered(page.getByRole('button', { name: /refresh/i }), 'Refresh button');
            await expectNoHorizontalOverflow(page);

            // The toggle opens the drawer over the content.
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            await expect(page.getByText('Minimum Rating')).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test(`library view at ${width}x${height}: the drawer can be closed again`, async ({ launchApp }) => {
            const { app, page } = await launchApp();
            await resize(app, page, width, height);
            const toggle = page.getByRole('button', { name: 'Toggle filters sidebar' });
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            await page.keyboard.press('Escape');
            if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click({ timeout: 3_000 });
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        });
    }

    test('folder mode at 1024x640: the sidebar does not cover the header and grid', async ({ env, launchApp }) => {
        await generateJpegs(path.join(env.photos, '2026-01-19'), 3);
        const launched = await launchApp();
        await openFolderGrid(launched, env);
        await resize(launched.app, launched.page, 1024, 640);
        await expectNoHorizontalOverflow(launched.page);
        await expectUncovered(launched.page.getByRole('heading', { name: 'Gallery', exact: true }), 'folder-mode title');
        await expectUncovered(launched.page.getByText('DSC_0001.JPG'), 'first thumbnail');
    });

    test('150% display scaling at 1280x720: the shell fits and its header controls are reachable', async ({ launchApp }) => {
        const { app, page } = await launchApp(['--force-device-scale-factor=1.5']);
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1.5);
        await resize(app, page, 1280, 720);
        await expectNoHorizontalOverflow(page);
        await expectUncovered(page.getByRole('button', { name: 'Toggle filters sidebar' }), 'sidebar toggle');
        await expectUncovered(page.getByRole('heading', { name: 'Image Gallery' }), 'gallery title');
        await expectUncovered(page.getByRole('button', { name: /refresh/i }), 'Refresh button');
        await expectUncovered(page.getByText('Minimum Rating'), 'sidebar filters');
    });
});
