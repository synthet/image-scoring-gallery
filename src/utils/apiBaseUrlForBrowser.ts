const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Hostname the web version was opened by; undefined in the desktop app, where loopback is the right host. */
function browserPageHostname(): string | undefined {
    if (typeof window === 'undefined' || window.electron) return undefined;
    return window.location.hostname || undefined;
}

/**
 * Base URL for opening the Python WebUI in the system browser (Electron shell or window.open).
 * Uses {@link AppConfig.api.browserUrl} when set (host-reachable); otherwise {@link AppConfig.api.url}.
 *
 * In the web version a loopback backend host means "the machine serving the gallery", so it is
 * replaced by the hostname the page was opened by: from another PC, 127.0.0.1 would be that PC (#288).
 */
export function apiBaseUrlForExternalOpen(
    cfg: { url: string; browserUrl?: string },
    pageHostname: string | undefined = browserPageHostname(),
): string {
    const raw = (cfg.browserUrl ?? cfg.url).trim().replace(/\/$/, '');
    const host = pageHostname?.replace(/^\[(.*)\]$/, '$1');
    if (!host || LOOPBACK_HOSTS.has(host)) return raw;
    try {
        const url = new URL(raw);
        if (!LOOPBACK_HOSTS.has(url.hostname)) return raw;
        url.hostname = host.includes(':') ? `[${host}]` : host;
        return url.toString().replace(/\/$/, '');
    } catch {
        return raw;
    }
}
