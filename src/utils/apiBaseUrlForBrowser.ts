/**
 * Base URL for opening the Python WebUI in the system browser (Electron shell or window.open).
 * Uses {@link AppConfig.api.browserUrl} when set (host-reachable); otherwise {@link AppConfig.api.url}.
 */
export function apiBaseUrlForExternalOpen(cfg: { url: string; browserUrl?: string }): string {
    const raw = (cfg.browserUrl ?? cfg.url).trim();
    return raw.replace(/\/$/, '');
}
