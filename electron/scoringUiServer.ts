/**
 * Serves the Python backend's built React SPA from disk (image-scoring-backend/static/app)
 * and proxies /api, /ws, etc. to the real FastAPI server. Electron can load the UI when
 * :7860 only serves API (or is temporarily down): shell and assets still load from localhost.
 */

import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function resolveBackendUiStaticDir(electronDistDir: string): string | null {
    const candidates = [
        path.join(electronDistDir, '..', 'image-scoring-backend', 'static', 'app'),
        path.join(electronDistDir, '..', 'image-scoring', 'static', 'app'),
    ];
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, 'index.html'))) {
            return dir;
        }
    }
    return null;
}

export interface ScoringUiServer {
    baseUrl: string;
    close: () => Promise<void>;
}

/**
 * Binds 127.0.0.1:0. Proxy target is resolved per request via getBackendBaseUrl().
 */
export function startScoringUiServer(
    getBackendBaseUrl: () => string,
    staticRoot: string,
): Promise<ScoringUiServer> {
    const app = express();

    const proxy = createProxyMiddleware({
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
        ws: true,
        router: () => getBackendBaseUrl(),
        pathFilter: (pathname: string) =>
            pathname.startsWith('/api') ||
            pathname.startsWith('/public') ||
            pathname.startsWith('/source-image') ||
            pathname.startsWith('/ws'),
        on: {
            error(err, _req, res) {
                const out = res as http.ServerResponse | undefined;
                if (out && !out.headersSent && typeof out.writeHead === 'function') {
                    try {
                        out.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
                        out.end('Backend unavailable');
                    } catch {
                        /* ignore */
                    }
                }
                console.warn('[ScoringUI] proxy error:', err?.message ?? err);
            },
        },
    });

    app.use('/ui', express.static(staticRoot));
    app.get(/^\/ui(\/.*)?$/, (_req, res) => {
        res.sendFile(path.join(staticRoot, 'index.html'));
    });

    app.use(proxy);

    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.on('upgrade', proxy.upgrade);
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr && addr !== null && 'port' in addr ? addr.port : 0;
            if (!port) {
                reject(new Error('Scoring UI server: no port'));
                return;
            }
            console.log(`[ScoringUI] static + proxy at http://127.0.0.1:${port} → ${getBackendBaseUrl()} (SPA: ${staticRoot})`);
            resolve({
                baseUrl: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((resClose, rejClose) => {
                        server.close((e) => (e ? rejClose(e) : resClose()));
                    }),
            });
        });
    });
}
