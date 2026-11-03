/**
 * URL checks for the renderer's ways out of the app (#224): links handed to the operating system,
 * window.open, and navigations of the main window.
 */

function parse(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

/**
 * True when `url` is an http(s) URL on the origin of one of `allowedBaseUrls` (the configured backend
 * URL and browser URL). Everything else, including file:, javascript: and other hosts or ports, is
 * refused, so a page script can't use the gallery to open arbitrary links or launch local programs.
 */
export function isAllowedExternalUrl(url: string, allowedBaseUrls: readonly string[]): boolean {
    const target = parse(url);
    if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) return false;
    return allowedBaseUrls.some((base) => parse(base)?.origin === target.origin);
}

/**
 * True when navigating from `appUrl` (the page the window loaded) to `targetUrl` stays on the app:
 * the same http(s) origin in development, or the same local file (any hash or query) in a build.
 */
export function isAllowedAppNavigation(targetUrl: string, appUrl: string): boolean {
    const target = parse(targetUrl);
    const app = parse(appUrl);
    if (!target || !app || target.protocol !== app.protocol) return false;
    if (app.protocol === 'file:') return target.pathname === app.pathname;
    if (app.protocol === 'http:' || app.protocol === 'https:') return target.origin === app.origin;
    return false;
}
