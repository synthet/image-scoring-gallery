import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron, expect, type ElectronApplication, type Page, type TestInfo } from '@playwright/test';
import { startFakeBackend, type FakeBackend } from './fakeBackend';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

export interface E2eEnv {
    root: string;
    userData: string;
    photos: string;
    configPath: string;
    backend: FakeBackend;
    env: Record<string, string>;
}

/**
 * Hermetic environment for one test: a temp root with its own `userData`, a generated config that
 * points the `api` database engine and the backend at a fake server, and an empty photos folder.
 * The app reads these through GALLERY_E2E / GALLERY_USER_DATA / GALLERY_CONFIG (electron/e2eHooks.ts).
 */
export async function makeEnv(): Promise<E2eEnv> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-e2e-'));
    const userData = path.join(root, 'userData');
    const photos = path.join(root, 'photos');
    fs.mkdirSync(userData);
    fs.mkdirSync(photos);
    const backend = await startFakeBackend();
    const configPath = path.join(root, 'e2e-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
        database: { engine: 'api', api: { url: backend.url, timeout: 5000 } },
        api: { url: backend.url },
    }, null, 2));

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
    }
    // e2e runs the built output. electron-is-dev treats every unpackaged launch as dev (loading the Vite
    // server) unless ELECTRON_IS_DEV is set, so force it off rather than just removing it.
    delete env.ELECTRON_RUN_AS_NODE;
    Object.assign(env, {
        ELECTRON_IS_DEV: '0', GALLERY_E2E: '1', GALLERY_USER_DATA: userData, GALLERY_CONFIG: configPath,
    });
    return { root, userData, photos, configPath, backend, env };
}

export interface Launched {
    app: ElectronApplication;
    page: Page;
    /** Uncaught page errors and console errors seen so far. */
    errors: string[];
    /** Main-process stdout and stderr since launch (stderr lines prefixed with "ERR "). */
    mainLog: string[];
    pid: number | undefined;
}

/** Main-process log lines that mean a crash or an uncaught error, as Electron prints them. */
export const MAIN_ERROR_PATTERN = /A JavaScript error occurred in the main process|Uncaught Exception|UnhandledPromiseRejection/i;

/** Launches the built app (dist-electron + dist) and waits until the shell has left its connecting screen. */
export async function launch(e: E2eEnv, extraArgs: string[] = []): Promise<Launched> {
    const app = await _electron.launch({ args: [...extraArgs, '.'], cwd: REPO_ROOT, env: e.env, timeout: 60_000 });
    const pid = app.process().pid;
    const mainLog: string[] = [];
    app.process().stdout?.on('data', (d: Buffer) => mainLog.push(...String(d).split(/\r?\n/).filter(Boolean)));
    app.process().stderr?.on('data', (d: Buffer) =>
        mainLog.push(...String(d).split(/\r?\n/).filter(Boolean).map((l) => `ERR ${l}`)));
    try {
        const page = await app.firstWindow();
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
        });
        await expect(page.locator('body[data-app-ready]')).toBeAttached({ timeout: 30_000 });
        return { app, page, errors, mainLog, pid };
    } catch (err) {
        // The caller never gets a handle on failure, so close here; otherwise Electron keeps the temp
        // profile locked and cleanup fails.
        await app.close().catch(() => undefined);
        throw err;
    }
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/** Closes the app and asserts its main process is gone. */
export async function closeApp(launched: Launched): Promise<void> {
    await launched.app.close();
    const { pid } = launched;
    if (pid) await expect.poll(() => isAlive(pid), { timeout: 15_000 }).toBe(false);
}

/** Stops the fake backend and removes the temp root (retrying while Windows still holds files). */
export async function disposeEnv(e: E2eEnv): Promise<void> {
    await e.backend.close();
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            fs.rmSync(e.root, { recursive: true, force: true });
            return;
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY') throw err;
            await new Promise((r) => setTimeout(r, 300));
        }
    }
}

/** Clicks an application-menu item by its labels, e.g. ['View', 'Mode: Folder']. Throws if it is missing or disabled. */
export async function clickMenu(app: ElectronApplication, labels: string[]): Promise<void> {
    await app.evaluate(({ Menu, BrowserWindow }, path) => {
        let items = Menu.getApplicationMenu()?.items ?? [];
        let item: Electron.MenuItem | undefined;
        for (const label of path) {
            item = items.find((i) => i.label === label);
            if (!item) throw new Error(`menu item not found: ${path.join(' › ')}`);
            items = item.submenu?.items ?? [];
        }
        if (!item!.enabled) throw new Error(`menu item disabled: ${path.join(' › ')}`);
        // MenuItem.click() flips checkbox/radio state itself before calling the handler, like a real click.
        item!.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
    }, labels);
}

/** State of an application-menu item, or null when it does not exist. */
export async function menuItemState(app: ElectronApplication, labels: string[]) {
    return app.evaluate(({ Menu }, path) => {
        let items = Menu.getApplicationMenu()?.items ?? [];
        let item: Electron.MenuItem | undefined;
        for (const label of path) {
            item = items.find((i) => i.label === label);
            if (!item) return null;
            items = item.submenu?.items ?? [];
        }
        return item ? { enabled: item.enabled, checked: item.checked } : null;
    }, labels);
}

/** Native dialogs bypass Playwright: replace showOpenDialog in the main process for this app run. */
export async function stubOpenDialog(app: ElectronApplication, filePaths: string[]): Promise<void> {
    await app.evaluate(({ dialog }, paths) => {
        dialog.showOpenDialog = (async () => ({ canceled: paths.length === 0, filePaths: paths })) as typeof dialog.showOpenDialog;
    }, filePaths);
}

/** Switches to folder mode and sets its root to `env.photos` through the (stubbed) folder dialog. */
export async function setFolderModeRoot({ app, page }: Launched, env: E2eEnv): Promise<void> {
    await clickMenu(app, ['View', 'Mode: Folder']);
    await page.getByRole('button', { name: /root folder/i }).click();
    const dialog = page.getByRole('dialog', { name: /root folder|folder mode/i });
    await stubOpenDialog(app, [env.photos]);
    await dialog.getByRole('button', { name: /browse/i }).click();
    await dialog.getByRole('button', { name: /save/i }).click();
}

/** Folder mode rooted at `env.photos`, opened on its 2026-01-19 folder (see generateJpegs); returns once the grid shows it. */
export async function openFolderGrid(launched: Launched, env: E2eEnv): Promise<void> {
    await setFolderModeRoot(launched, env);
    await launched.page.getByText('2026-01-19', { exact: true }).first().click();
    await expect(launched.page.getByText('DSC_0001.JPG')).toBeVisible();
}

/** Attaches a screenshot of the window when a test fails (Playwright cannot do this for Electron pages itself). */
export async function attachOnFailure(testInfo: TestInfo, page: Page | undefined): Promise<void> {
    if (!page || testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
    try {
        await testInfo.attach('window', { body: await page.screenshot(), contentType: 'image/png' });
    } catch {
        // window already gone
    }
}
