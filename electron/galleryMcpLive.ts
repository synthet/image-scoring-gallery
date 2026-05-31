import path from "path";

export interface GalleryLiveServerHandle {
    port: number;
    sseUrl: string;
    close: () => Promise<void>;
}

let galleryMcpLive: GalleryLiveServerHandle | null = null;

export function isGalleryMcpLiveEnabled(): boolean {
    return process.env.ELECTRON_IS_DEV === "1" || process.env.ENABLE_GALLERY_MCP_SSE === "1";
}

export async function startGalleryMcpLiveFromElectron(options: {
    projectRoot: string;
    getWindowStatus: () => Promise<Record<string, unknown>>;
}): Promise<void> {
    if (!isGalleryMcpLiveEnabled() || galleryMcpLive) {
        return;
    }

    const port = parseInt(process.env.GALLERY_MCP_PORT ?? "9373", 10);
    // ESM mcp-server bundle; types in galleryMcpLive.d.ts
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error — runtime ESM import from CJS electron main
    const mod = await import("../mcp-server/dist/liveServer.js");
    galleryMcpLive = await mod.startGalleryMcpLiveServer({
        projectRoot: options.projectRoot,
        port,
        hooks: { getWindowStatus: options.getWindowStatus },
    });
    console.log(`[Main] image-scoring-gallery-live MCP at ${galleryMcpLive?.sseUrl ?? "unknown"}`);
}

export async function stopGalleryMcpLiveFromElectron(): Promise<void> {
    if (!galleryMcpLive) return;
    await galleryMcpLive.close();
    galleryMcpLive = null;
}

export function galleryMcpLockPath(projectRoot: string): string {
    return path.join(projectRoot, "gallery-mcp.lock");
}
