import path from 'node:path';
import { clickMenu, menuItemState, stubOpenDialog } from './harness';
import { generateJpegs } from './fixtures';
import { expect, test } from './fixture';

test.describe('Journey 1: startup and shell', () => {
    test('a fresh profile shows the empty gallery with the backend connected', async ({ launchApp }) => {
        const { page } = await launchApp();
        await expect(page.getByText('Image Gallery', { exact: true })).toBeVisible();
        await expect(page.getByText('(0 items)')).toBeVisible();
        // The fake backend answers /api/health, so the status chip must not stay offline.
        await expect(page.getByTestId('backend-status-chip')).toHaveAttribute('aria-label', /^Backend connected/);
    });

    test('folder mode: picking a root folder through the dialog shows its photos', async ({ env, launchApp }) => {
        const photos = path.join(env.photos, '2026-01-19');
        await generateJpegs(photos, 3);
        const { app, page } = await launchApp();

        await clickMenu(app, ['View', 'Mode: Folder']);
        await page.getByRole('button', { name: /root folder/i }).click();
        const dialog = page.getByRole('dialog', { name: /root folder|folder mode/i });
        await expect(dialog).toBeVisible();

        await stubOpenDialog(app, [env.photos]);
        await dialog.getByRole('button', { name: /browse/i }).click();
        await expect(dialog.getByRole('textbox')).toHaveValue(env.photos);
        await dialog.getByRole('button', { name: /save/i }).click();

        // Navigate into the dated folder and see the generated photos.
        await page.getByText('2026-01-19', { exact: true }).first().click();
        await expect(page.getByText('DSC_0001.JPG')).toBeVisible();
        await expect(page.getByText('DSC_0003.JPG')).toBeVisible();
    });

    test('Tools › Scoring opens the scoring window on the local backend', async ({ launchApp }) => {
        const { app } = await launchApp();
        // Scoring is enabled only once the backend health check has connected.
        await expect.poll(() => menuItemState(app, ['Tools', 'Scoring...'])).toMatchObject({ enabled: true });
        const opened = app.waitForEvent('window');
        await clickMenu(app, ['Tools', 'Scoring...']);
        const scoring = await opened;
        await expect.poll(() => scoring.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/ui\/runs/);
        // A second native window, not a navigation of the main one.
        expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
    });
});
