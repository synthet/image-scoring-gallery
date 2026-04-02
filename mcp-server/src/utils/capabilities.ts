import { resolveApiUrl } from "./config.js";

/**
 * Base URL for Chrome DevTools HTTP (Electron remote debugging).
 * ELECTRON_CDP_URL wins if set (e.g. http://127.0.0.1:9222).
 * Else ELECTRON_REMOTE_DEBUGGING_PORT or ELECTRON_CDP_PORT (digits only), default 9222.
 */
export function getCdpBaseUrl(): string {
    const full = process.env.ELECTRON_CDP_URL?.trim();
    if (full) {
        return full.replace(/\/$/, "");
    }
    const port =
        process.env.ELECTRON_REMOTE_DEBUGGING_PORT?.trim() ||
        process.env.ELECTRON_CDP_PORT?.trim() ||
        "9222";
    if (!/^\d+$/.test(port)) {
        return "http://127.0.0.1:9222";
    }
    return `http://127.0.0.1:${port}`;
}

export async function probePythonApi(): Promise<{
    reachable: boolean;
    base_url: string;
    error?: string;
}> {
    const base_url = await resolveApiUrl();
    try {
        const resp = await fetch(`${base_url}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
            return { reachable: true, base_url };
        }
        return { reachable: false, base_url, error: `HTTP ${resp.status} ${resp.statusText}` };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        return { reachable: false, base_url, error };
    }
}

export async function probeElectronCdp(): Promise<{
    reachable: boolean;
    cdp_url: string;
    target_count?: number;
    error?: string;
}> {
    const cdp_url = getCdpBaseUrl();
    try {
        const resp = await fetch(`${cdp_url}/json`, { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) {
            return { reachable: false, cdp_url, error: `HTTP ${resp.status} ${resp.statusText}` };
        }
        const targets = (await resp.json()) as unknown;
        const target_count = Array.isArray(targets) ? targets.length : 0;
        return { reachable: true, cdp_url, target_count };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        return { reachable: false, cdp_url, error };
    }
}

export async function collectGalleryStatus(): Promise<Record<string, unknown>> {
    const [python_api, electron_cdp] = await Promise.all([probePythonApi(), probeElectronCdp()]);
    return {
        python_api,
        electron_cdp,
        hints: {
            api_tools: python_api.reachable
                ? "api_* tools should work against the resolved base_url."
                : "Start the Python WebUI (e.g. run_webui.bat) for api_* tools.",
            cdp_tools: electron_cdp.reachable
                ? "cdp_* tools should work (Electron dev + remote debugging)."
                : "Run the gallery in dev with remote debugging (default port 9222) for cdp_* tools.",
        },
    };
}
