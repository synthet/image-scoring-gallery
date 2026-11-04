import { defineConfig } from '@playwright/test';

/**
 * Electron e2e (tests/e2e). Runs the built app (`npm run test:e2e` builds first), one app at a time.
 * Windows render offscreen, so a run shows nothing on the desktop; GALLERY_E2E_HEADED=1 shows them.
 */
export default defineConfig({
    testDir: 'tests/e2e',
    testMatch: '**/*.spec.ts',
    outputDir: 'test-results/e2e',
    workers: 1,
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    timeout: 120_000,
    expect: { timeout: 15_000 },
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        trace: 'retain-on-failure',
    },
});
