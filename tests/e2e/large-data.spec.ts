import path from 'node:path';
import { setFolderModeRoot } from './harness';
import { copyJpegs } from './fixtures';
import { expect, test } from './fixture';

/**
 * Budgets for this journey (recorded in docs/testing/e2e.md). Measured on the reference Windows machine
 * with the built app: first thumbnail 190-930 ms after opening the folder (2.6 s once, with other sessions
 * loading the machine), at most 40 cards rendered. The budgets leave room for a busy machine while still
 * catching a lost virtualization or a blocking load.
 */
const PHOTO_COUNT = 3_000;
const FIRST_THUMBNAIL_BUDGET_MS = 4_000;
const MAX_RENDERED_CARDS = 120;

test.describe('Journey 7: large data', () => {
    test.describe.configure({ timeout: 120_000 });

    test.beforeEach(async ({ env }) => {
        copyJpegs(path.join(env.photos, 'big'), PHOTO_COUNT);
    });

    test(`a ${PHOTO_COUNT}-photo folder virtualizes and shows its first thumbnail within budget`, async ({ env, launchApp }, testInfo) => {
        const launched = await launchApp();
        const { page } = launched;
        await setFolderModeRoot(launched, env);

        const items = page.getByTestId('virtuoso-item-list');
        const started = Date.now();
        await page.getByText('big', { exact: true }).first().click();
        await expect.poll(() => items.locator('img').evaluateAll((imgs) =>
            imgs.some((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)),
        { timeout: FIRST_THUMBNAIL_BUDGET_MS }).toBe(true);
        const firstThumbnailMs = Date.now() - started;
        testInfo.annotations.push({ type: 'first-thumbnail-ms', description: String(firstThumbnailMs) });
        expect(firstThumbnailMs).toBeLessThanOrEqual(FIRST_THUMBNAIL_BUDGET_MS);
        await expect(page.getByText(`${PHOTO_COUNT} images`)).toBeVisible();

        // Folder mode pages in 80 photos at a time as the grid nears its end. Scroll with the mouse wheel,
        // like a user, until the last photo is loaded and shown. (Setting scrollTop directly is not
        // equivalent: once the grid sits at the bottom, no further scroll events reach the paging trigger.)
        const scroller = page.getByTestId('virtuoso-scroller');
        const box = await scroller.boundingBox();
        if (!box) throw new Error('grid scroller has no layout box');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        const last = `DSC_${String(PHOTO_COUNT).padStart(4, '0')}.JPG`;
        const scrollStarted = Date.now();
        await expect.poll(async () => {
            for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 1_200);
            return items.getByTitle(last).isVisible();
        }, { timeout: 60_000, intervals: [100] }).toBe(true);
        testInfo.annotations.push({ type: 'scroll-to-end-ms', description: String(Date.now() - scrollStarted) });

        // With every photo loaded, the DOM stays bounded at the top, the middle and the end.
        for (const at of [0, 0.5, 1]) {
            await scroller.evaluate((el, f) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * f; }, at);
            await page.waitForTimeout(300);
            const n = await items.locator(':scope > *').count();
            expect(n, `rendered cards at ${at * 100}%`).toBeGreaterThan(0);
            expect(n, `rendered cards at ${at * 100}%`).toBeLessThanOrEqual(MAX_RENDERED_CARDS);
        }
    });

    test('keyboard navigation and select-all reach photos outside the rendered window', async ({ env, launchApp }) => {
        test.fail(true, '#227: the grid has no keyboard navigation or select-all');
        const launched = await launchApp();
        const { page } = launched;
        await setFolderModeRoot(launched, env);
        await page.getByText('big', { exact: true }).first().click();
        const items = page.getByTestId('virtuoso-item-list');
        await items.getByTitle('DSC_0001.JPG').click();

        // End moves to the last photo, which is far outside the rendered window.
        await page.keyboard.press('End');
        await expect(items.getByTitle(`DSC_${String(PHOTO_COUNT).padStart(4, '0')}.JPG`)).toBeVisible({ timeout: 3_000 });

        // Select-all selects every photo, not only the rendered ones.
        await page.keyboard.press('ControlOrMeta+A');
        await expect(page.getByText(new RegExp(`${PHOTO_COUNT} selected`))).toBeVisible({ timeout: 3_000 });
    });
});
