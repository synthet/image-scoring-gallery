import { expect, test } from '@playwright/test';
import { attachOnFailure, closeApp, disposeEnv, launch, makeEnv, type E2eEnv, type Launched } from './harness';

let env: E2eEnv;
let launched: Launched | undefined;

test.beforeEach(async () => {
    env = await makeEnv();
});

// Playwright requires the fixtures argument to be destructured, even when no fixture is used.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
    await attachOnFailure(testInfo, launched?.page);
    if (launched) await closeApp(launched).catch(() => undefined);
    launched = undefined;
    await disposeEnv(env);
});

test('a fresh profile starts, reaches the gallery shell, and closes cleanly', async () => {
    launched = await launch(env);
    const { page, app, errors } = launched;

    // The fake backend answered: the shell connected instead of showing a connection error.
    await expect(page.locator('body')).toHaveAttribute('data-app-state', 'gallery');
    await expect(page.getByRole('heading', { name: /connection error/i })).toHaveCount(0);

    // It used the hermetic profile and config, not the developer's.
    const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
    expect(userData).toBe(env.userData);
    expect(env.backend.requests.some((r) => r.path === '/api/db/query')).toBe(true);

    expect(errors).toEqual([]);
    await closeApp(launched);
    launched = undefined;
});
