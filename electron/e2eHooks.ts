/**
 * E2E test hooks (tests/e2e). Active only when the launcher sets GALLERY_E2E=1, so a normal or packaged
 * launch behaves exactly as before. When active:
 * - `userData` points at the test's temp folder (GALLERY_USER_DATA), so view prefs and session state
 *   never touch the real profile;
 * - the config is read from GALLERY_CONFIG instead of the app's own config file;
 * - side services that bind fixed ports (the live MCP server) are not started;
 * - windows are created hidden, so a run doesn't disturb the desktop (GALLERY_E2E_HEADED=1 shows them).
 *
 * Pure: reads only the environment object it is given.
 */
import type { BrowserWindowConstructorOptions } from 'electron';

export interface E2eOverrides {
    userData: string | null;
    configPath: string | null;
}

export function readE2eOverrides(env: NodeJS.ProcessEnv = process.env): E2eOverrides | null {
    if (env.GALLERY_E2E !== '1') return null;
    const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
    return { userData: clean(env.GALLERY_USER_DATA), configPath: clean(env.GALLERY_CONFIG) };
}

/**
 * Wraps the options of every window the app creates: hidden during an e2e run, unchanged otherwise.
 * The page renders offscreen because `show: false` alone isn't enough: in a hidden native window the
 * app's layout and thumbnails lag behind, and tests that pass on screen fail (#247).
 */
export function e2eWindowOptions(
    options: BrowserWindowConstructorOptions,
    env: NodeJS.ProcessEnv = process.env,
): BrowserWindowConstructorOptions {
    if (env.GALLERY_E2E !== '1' || env.GALLERY_E2E_HEADED === '1') return options;
    return { ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true, backgroundThrottling: false } };
}

/**
 * The config file every reader and writer must use: the e2e test's config when GALLERY_E2E=1 sets one,
 * otherwise the app's normal config path. Callers pass `defaultPath` (from `getConfigPath(__dirname)`), so
 * an e2e run can never read or overwrite the real config (Settings › Save writes through this path).
 */
export function resolveConfigPath(defaultPath: string, env: NodeJS.ProcessEnv = process.env): string {
    return readE2eOverrides(env)?.configPath ?? defaultPath;
}
