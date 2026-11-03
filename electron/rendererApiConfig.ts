import type { AppConfig } from './types';

export type RendererApiConfig = { url: string; browserUrl?: string };

/**
 * The backend URL the renderer links to (and the browser URL, when configured separately). Used by
 * `system:get-api-config` and by the main-process checks that only let backend links leave the app.
 */
export async function resolveRendererApiConfig(
    config: AppConfig,
    findActiveWebuiPort: () => Promise<number | null>,
): Promise<RendererApiConfig> {
    const apiPort = await findActiveWebuiPort();

    let port = apiPort || 7860;
    let host = '127.0.0.1';

    if (config.api) {
        if (config.api.url) {
            const url = config.api.url.replace(/\/$/, '');
            const browserRaw = config.api.browserUrl?.trim();
            const browserUrl = browserRaw ? browserRaw.replace(/\/$/, '') : undefined;
            return browserUrl ? { url, browserUrl } : { url };
        }
        if (config.api.port) port = config.api.port;
        if (config.api.host) host = config.api.host;
    }

    return { url: `http://${host}:${port}` };
}

/** The base URLs external links may point at: the backend URL and its browser URL. */
export function allowedExternalBaseUrls(cfg: RendererApiConfig): string[] {
    return cfg.browserUrl ? [cfg.url, cfg.browserUrl] : [cfg.url];
}
