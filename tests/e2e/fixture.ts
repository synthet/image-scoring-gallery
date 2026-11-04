import { expect, test as base } from '@playwright/test';
import { closeApp, disposeEnv, launch, makeEnv, MAIN_ERROR_PATTERN, type E2eEnv, type Launched } from './harness';

interface Fixtures {
    /** A fresh hermetic environment (temp profile, config, photos, fake backend) for this test. */
    env: E2eEnv;
    /** Launches the app in `env`; every launched app is closed after the test. */
    launchApp: (extraArgs?: string[]) => Promise<Launched>;
    /** Errors a test expects (substring match); anything else in page or main-process errors fails the test. */
    allowErrors: string[];
}

export const test = base.extend<Fixtures>({
    // Playwright's fixture callback is conventionally called `use`; it is named `provide` here because
    // the react-hooks lint rule treats any `use(...)` call as a React hook.
    allowErrors: [[], { option: true }],
    // eslint-disable-next-line no-empty-pattern
    env: async ({}, provide) => {
        const env = await makeEnv();
        await provide(env);
        await disposeEnv(env);
    },
    launchApp: async ({ env, allowErrors }, provide, testInfo) => {
        const launched: Launched[] = [];
        await provide(async (extraArgs = []) => {
            const l = await launch(env, extraArgs);
            launched.push(l);
            return l;
        });
        for (const l of launched) {
            if (testInfo.status !== testInfo.expectedStatus && !l.page.isClosed()) {
                await testInfo.attach('window', { body: await l.page.screenshot().catch(() => Buffer.alloc(0)), contentType: 'image/png' });
            }
            const visibleWindows = await countVisibleWindows(l);
            await closeApp(l).catch(() => undefined);
            await testInfo.attach('main-process.log', { body: l.mainLog.join('\n'), contentType: 'text/plain' });
            const unexpected = [
                ...l.errors,
                ...l.mainLog.filter((line) => MAIN_ERROR_PATTERN.test(line)),
            ].filter((e) => !allowErrors.some((a) => e.includes(a)));
            if (testInfo.status === testInfo.expectedStatus) {
                expect(unexpected, 'unexpected page or main-process errors').toEqual([]);
                expect(visibleWindows, 'a window was shown during a hidden run').toBe(0);
            }
        }
    },
});

/** Windows on screen at the end of a test. Always 0 when GALLERY_E2E_HEADED=1 asks for them, or the app has quit. */
async function countVisibleWindows({ app }: Launched): Promise<number> {
    if (process.env.GALLERY_E2E_HEADED === '1') return 0;
    return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length).catch(() => 0);
}

export { expect };
