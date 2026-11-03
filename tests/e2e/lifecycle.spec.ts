import { clickMenu, MAIN_ERROR_PATTERN, menuItemState } from './harness';
import { expect, test } from './fixture';

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

test.describe('Journey 3: lifecycle and clean shutdown', () => {
    test('closing the main window quits the app with no leftover process or main-process error', async ({ launchApp }) => {
        const l = await launchApp();
        const exited = new Promise<void>((resolve) => l.app.process().once('exit', () => resolve()));
        await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
        await exited;
        expect(l.pid && isAlive(l.pid)).toBeFalsy();
        expect(l.mainLog.filter((line) => MAIN_ERROR_PATTERN.test(line))).toEqual([]);
    });

    test('closing the main window while the scoring window is open still quits cleanly', async ({ launchApp }) => {
        const l = await launchApp();
        await expect.poll(() => menuItemState(l.app, ['Tools', 'Scoring...'])).toMatchObject({ enabled: true });
        const opened = l.app.waitForEvent('window');
        await clickMenu(l.app, ['Tools', 'Scoring...']);
        await opened;
        const exited = new Promise<void>((resolve) => l.app.process().once('exit', () => resolve()));
        // Close the main window only; the app must not linger with just the scoring window.
        await l.app.evaluate(({ BrowserWindow }) => {
            const main = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('/ui/runs'));
            main?.close();
        });
        await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('app still running 15 s after the main window closed')), 15_000))]);
        expect(l.pid && isAlive(l.pid)).toBeFalsy();
        expect(l.mainLog.filter((line) => MAIN_ERROR_PATTERN.test(line))).toEqual([]);
    });
});
