import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { copyJpegs } from './fixtures';
import { expect, test } from './fixture';

/** media:/// URL for an absolute Windows or POSIX path, the way the renderer builds it (src/utils/mediaUrl.ts). */
function mediaUrl(absPath: string): string {
    const p = absPath.replace(/\\/g, '/');
    return /^[a-zA-Z]:\//.test(p) ? `media:///${p}` : `media://${p}`;
}

test.describe('Journey 4: security regressions', () => {
    test('the page has no Node.js access', async ({ launchApp }) => {
        const { page } = await launchApp();
        expect(await page.evaluate(() => ({
            require: typeof (window as unknown as { require?: unknown }).require,
            process: typeof (window as unknown as { process?: unknown }).process,
            module: typeof (window as unknown as { module?: unknown }).module,
        }))).toEqual({ require: 'undefined', process: 'undefined', module: 'undefined' });
    });

    test('the preload API surface matches the reviewed snapshot (no accidental new powers)', async ({ launchApp }) => {
        const { page } = await launchApp();
        const surface = await page.evaluate(() => {
            const api = (window as unknown as { electron: Record<string, unknown> }).electron;
            const keys = (o: Record<string, unknown>) => Object.keys(o).sort();
            const nested: Record<string, string[]> = {};
            for (const k of keys(api)) {
                const v = api[k];
                if (v && typeof v === 'object') nested[k] = keys(v as Record<string, unknown>);
            }
            return { top: keys(api), nested };
        });
        expect(JSON.stringify(surface, null, 2)).toMatchSnapshot('preload-api-surface.json');
    });

    test('window.open does not create a new window', async ({ launchApp }) => {
        const { app, page } = await launchApp();
        const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
        const opened = app.waitForEvent('window', { timeout: 3_000 }).then(() => true, () => false);
        await page.evaluate(() => { window.open('http://127.0.0.1:9/evil'); });
        expect(await opened, 'a window was opened for a remote URL').toBe(false);
        expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(before);
    });

    test('the main window cannot be navigated to a remote origin', async ({ env, launchApp }) => {
        const { page } = await launchApp();
        const start = page.url();
        // A reachable origin (the fake backend), so a missing navigation guard really commits the navigation.
        const remote = `${env.backend.url}/evil`;
        const navigated = page.waitForURL((u) => u.href.startsWith(env.backend.url), { timeout: 5_000 })
            .then(() => true, () => false);
        await page.evaluate((url) => { window.location.href = url; }, remote).catch(() => undefined);
        expect(await navigated, 'the main window navigated to a remote origin').toBe(false);
        expect(env.backend.requests.some((r) => r.path === '/evil'), 'the remote page was requested').toBe(false);
        expect(page.url()).toBe(start);
    });

    test.describe('media protocol', () => {
        // The refused fetch makes Chromium log the 403; that log line is the expected outcome here.
        test.use({ allowErrors: ['status of 403 (Forbidden)'] });

        test('the media protocol refuses a non-image file outside the photo folders', async ({ env, launchApp }) => {
            const secret = path.join(env.root, 'not-a-photo.txt');
            fs.writeFileSync(secret, 'secret');
            const { page } = await launchApp();
            const result = await page.evaluate(async (url) => {
                try {
                    const r = await fetch(url);
                    return { status: r.status, body: r.ok ? await r.text() : '' };
                } catch (e) {
                    return { status: 0, body: String(e) };
                }
            }, mediaUrl(secret));
            expect(result.body, 'file outside allowed roots was served').not.toBe('secret');
        });

        test('the media protocol refuses ".." traversal to a non-image file', async ({ env, launchApp }) => {
            fs.writeFileSync(path.join(env.root, 'outside.txt'), 'outside');
            const { page } = await launchApp();
            const traversal = mediaUrl(env.photos) + '/../outside.txt';
            const body = await page.evaluate(async (url) => {
                try {
                    const r = await fetch(url);
                    return r.ok ? await r.text() : '';
                } catch {
                    return '';
                }
            }, traversal);
            expect(body, 'traversal outside the photo folder was served').not.toBe('outside');
        });

        /** Status of a media:// fetch of `file` from the page. */
        const mediaStatus = (page: Page, file: string) => page.evaluate(async (url) => {
            try {
                return (await fetch(url)).status;
            } catch {
                return 0;
            }
        }, mediaUrl(file));

        test('the media protocol refuses an image outside the gallery folders', async ({ env, launchApp }) => {
            const elsewhere = path.join(env.root, 'elsewhere');
            copyJpegs(elsewhere, 1);
            const { page } = await launchApp();
            expect(await mediaStatus(page, path.join(elsewhere, 'DSC_0001.JPG'))).toBe(403);
        });

        test('the media protocol serves an image in a library folder', async ({ env, launchApp }) => {
            const library = path.join(env.root, 'library');
            copyJpegs(library, 1);
            env.backend.onSql((sql, params) =>
                (/FROM folders WHERE path/i.test(sql) && String(params[0]).endsWith('/library') ? [{ id: 1 }] : undefined));
            const { page } = await launchApp();
            expect(await mediaStatus(page, path.join(library, 'DSC_0001.JPG'))).toBe(200);
        });
    });

    test('IPC rejects malformed arguments', async ({ launchApp }) => {
        const { page } = await launchApp();
        const err = await page.evaluate(async () => {
            const api = (window as unknown as { electron: { setShowEyes: (v: unknown) => Promise<unknown> } }).electron;
            try {
                await api.setShowEyes('yes');
                return null;
            } catch (e) {
                return String(e);
            }
        });
        expect(err).toMatch(/boolean/);
    });

    test('openExternalUrl hands only backend links to the operating system', async ({ env, launchApp }) => {
        const { app, page } = await launchApp();
        await app.evaluate(({ shell }) => {
            const g = globalThis as unknown as { __opened: string[] };
            g.__opened = [];
            shell.openExternal = (async (url: string) => { g.__opened.push(url); }) as typeof shell.openExternal;
        });
        const open = (url: string) => page.evaluate(async (u) => {
            const api = (window as unknown as { electron: { openExternalUrl: (u: string) => Promise<void> } }).electron;
            return api.openExternalUrl(u).then(() => 'opened', (e) => String(e));
        }, url);
        const calc = pathToFileURL(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'calc.exe')).href;
        const backendLink = `${env.backend.url}/ui/images/1`;

        expect(await open(calc)).toMatch(/configured backend/);
        expect(await open('http://127.0.0.1:9/elsewhere')).toMatch(/configured backend/);
        expect(await open(backendLink)).toBe('opened');
        const opened = await app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);
        expect(opened, 'only the backend link reached shell.openExternal').toEqual([backendLink]);
    });
});
