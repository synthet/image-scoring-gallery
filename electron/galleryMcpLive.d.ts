declare module "../mcp-server/dist/liveServer.js" {
    export interface GalleryLiveServer {
        port: number;
        sseUrl: string;
        close: () => Promise<void>;
    }

    export function startGalleryMcpLiveServer(options: {
        port?: number;
        projectRoot: string;
        hooks?: {
            getWindowStatus?: () => Promise<Record<string, unknown>>;
        };
    }): Promise<GalleryLiveServer>;
}
