/**
 * Loopback + private/Docker/WSL hosts allowed for gallery MCP HTTP probes.
 * Mirrors image-scoring-backend modules/mcp_server.py client allowlist.
 */
export function isAllowedLocalHost(hostname: string): boolean {
    const host = hostname.trim().toLowerCase();
    if (!host || host === "localhost" || host === "::1") {
        return true;
    }
    if (host.startsWith("127.")) {
        return true;
    }
    if (host.startsWith("10.")) {
        return true;
    }
    if (host.startsWith("192.168.")) {
        return true;
    }
    if (host.startsWith("169.254.")) {
        return true;
    }
    const m = /^172\.(\d+)\./.exec(host);
    if (m) {
        const second = Number.parseInt(m[1], 10);
        if (second >= 16 && second <= 31) {
            return true;
        }
    }
    return false;
}

export function assertLocalHttpUrl(url: string, label: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`${label}: invalid URL`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`${label}: only http(s) URLs are allowed`);
    }
    if (!isAllowedLocalHost(parsed.hostname)) {
        throw new Error(
            `${label}: host must be localhost or a private/Docker/WSL address (got ${parsed.hostname})`
        );
    }
    return url.replace(/\/$/, "");
}
