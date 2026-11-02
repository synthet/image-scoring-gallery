/**
 * E2E test hooks (tests/e2e). Active only when the launcher sets GALLERY_E2E=1, so a normal or packaged
 * launch behaves exactly as before. When active:
 * - `userData` points at the test's temp folder (GALLERY_USER_DATA), so view prefs and session state
 *   never touch the real profile;
 * - the config is read from GALLERY_CONFIG instead of the app's own config file;
 * - side services that bind fixed ports (the live MCP server) are not started.
 *
 * Pure: reads only the environment object it is given.
 */
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
 * The config file every reader and writer must use: the e2e test's config when GALLERY_E2E=1 sets one,
 * otherwise the app's normal config path. Callers pass `defaultPath` (from `getConfigPath(__dirname)`), so
 * an e2e run can never read or overwrite the real config (Settings › Save writes through this path).
 */
export function resolveConfigPath(defaultPath: string, env: NodeJS.ProcessEnv = process.env): string {
    return readE2eOverrides(env)?.configPath ?? defaultPath;
}
