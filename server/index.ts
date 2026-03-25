/**
 * Browser-mode Express server.
 * Exposes the same DB / config / API methods as the Electron IPC bridge,
 * accessible via HTTP under /gallery-api/*.  Also serves media files under /media/*.
 *
 * Usage:
 *   npx tsx server/index.ts           (dev)
 *   node dist-server/server/index.js  (prod)
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';

import * as db from '../electron/db';
import { loadAppConfig, getConfigPath } from '../electron/config';
import { ApiService } from '../electron/apiService';
import { resolveBaseUrl } from '../electron/apiUrlResolver';

// ── Config ────────────────────────────────────────────────────────────────────

const configPath = getConfigPath(path.resolve(__dirname, '../electron'));
const appConfig = loadAppConfig(configPath);
const apiService = new ApiService(() => appConfig);
const backendBaseUrl = resolveBaseUrl(appConfig);

// ── DB Startup ────────────────────────────────────────────────────────────────

async function startServer() {
    try {
        await db.connectDB();
        console.log('[Server] DB connected');
    } catch (e) {
        console.warn('[Server] DB connect failed (will retry on first request):', e);
    }

    // ── Express App ───────────────────────────────────────────────────────────

    const app = express();
    app.use(express.json({ limit: '10mb' }));

    // In production mode, serve the Vite build
    const distDir = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distDir)) {
        app.use(express.static(distDir));
    }

    // ── Error Helpers ─────────────────────────────────────────────────────────

    function ok(res: Response, data: unknown) {
        res.json({ ok: true, data });
    }

    function fail(res: Response, err: unknown, status = 500) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Server]', message);
        res.status(status).json({ ok: false, error: message });
    }

    function wrap(handler: (req: Request, res: Response) => Promise<void>) {
        return (req: Request, res: Response, next: NextFunction) => {
            handler(req, res).catch(next);
        };
    }

    // ── /gallery-api Routes ───────────────────────────────────────────────────

    const router = express.Router();

    // Ping
    router.get('/ping', (_req, res) => res.json('pong'));

    // DB: check connection
    router.get('/db/check-connection', wrap(async (_req, res) => {
        try {
            const result = await db.checkConnection();
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: image count
    router.get('/db/image-count', wrap(async (req, res) => {
        try {
            const result = await db.getImageCount(parseQueryOptions(req.query));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: images
    router.get('/db/images', wrap(async (req, res) => {
        try {
            const result = await db.getImages(parseQueryOptions(req.query));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: image details
    router.get('/db/image/:id', wrap(async (req, res) => {
        try {
            const result = await db.getImageDetails(parseInt(req.params.id, 10));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: update image
    router.post('/db/image/:id', wrap(async (req, res) => {
        try {
            const result = await db.updateImageDetails(parseInt(req.params.id, 10), req.body as Record<string, string | number | null>);
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: delete image
    router.delete('/db/image/:id', wrap(async (req, res) => {
        try {
            const result = await db.deleteImage(parseInt(req.params.id, 10));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: delete folder
    router.delete('/db/folder/:id', wrap(async (req, res) => {
        try {
            const result = await db.deleteFolder(parseInt(req.params.id, 10));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: folders
    router.get('/db/folders', wrap(async (_req, res) => {
        try {
            const result = await db.getFolders();
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: keywords
    router.get('/db/keywords', wrap(async (_req, res) => {
        try {
            const result = await db.getKeywords();
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: stacks
    router.get('/db/stacks', wrap(async (req, res) => {
        try {
            const result = await db.getStacks(parseQueryOptions(req.query));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: images by stack
    router.get('/db/stacks/:stackId/images', wrap(async (req, res) => {
        try {
            const stackId = req.params.stackId === 'null' ? null : parseInt(req.params.stackId, 10);
            const result = await db.getImagesByStack(stackId, parseQueryOptions(req.query));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: stack count
    router.get('/db/stack-count', wrap(async (req, res) => {
        try {
            const result = await db.getStackCount(parseQueryOptions(req.query));
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // DB: rebuild stack cache
    router.post('/db/rebuild-stack-cache', wrap(async (_req, res) => {
        try {
            const count = await db.rebuildStackCache();
            ok(res, { success: true, count });
        } catch (e) { fail(res, e); }
    }));

    // Config: get
    router.get('/config', (_req, res) => {
        res.json(appConfig);
    });

    // Config: save (partial update, writes to disk)
    router.post('/config', wrap(async (req, res) => {
        try {
            const updates = req.body as Record<string, unknown>;
            const existing = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown> : {};
            const merged = deepMerge(existing, updates);
            fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
            res.json(loadAppConfig(configPath));
        } catch (e) { fail(res, e); }
    }));

    // Config: API config (for WebSocket / Python backend URL)
    router.get('/api-config', (_req, res) => {
        res.json({ url: backendBaseUrl });
    });

    // Near duplicates (via Python backend)
    router.post('/db/near-duplicates', wrap(async (req, res) => {
        try {
            const result = await apiService.findDuplicates(req.body as Record<string, unknown>);
            res.json(result);
        } catch (e) { fail(res, e); }
    }));

    // Similar images (via Python backend)
    router.post('/db/similar', wrap(async (req, res) => {
        try {
            const { imageId, limit, folderId, folderPath, minSimilarity } = req.body as {
                imageId: number;
                limit?: number;
                folderId?: number;
                folderPath?: string;
                minSimilarity?: number;
            };
            const resolvedFolderPath = folderPath || (folderId ? await db.getFolderPathById(folderId) : undefined) || undefined;
            const result = await apiService.searchSimilar({
                image_id: imageId,
                limit,
                folder_path: resolvedFolderPath,
                min_similarity: minSimilarity,
            });
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // Outliers (via Python backend)
    router.post('/db/outliers', wrap(async (req, res) => {
        try {
            const { folderPath, zThreshold, k, limit } = req.body as {
                folderPath: string;
                zThreshold?: number;
                k?: number;
                limit?: number;
            };
            if (!folderPath) { fail(res, 'folder_path is required', 400); return; }
            const result = await apiService.getOutliers({
                folder_path: folderPath,
                z_threshold: zThreshold,
                k,
                limit,
            });
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // Import: run (register folder with Python backend)
    router.post('/import/run', wrap(async (req, res) => {
        try {
            const { folderPath } = req.body as { folderPath: string };
            if (!folderPath) { fail(res, 'folderPath is required', 400); return; }
            const result = await apiService.importRegister({ folder_path: folderPath });
            ok(res, result);
        } catch (e) { fail(res, e); }
    }));

    // ── Backend proxy: /gallery-api/backend/* → Python /api/* ─────────────────

    router.all('/backend/*path', wrap(async (req, res) => {
        const suffix = (req.params as Record<string, string>).path ?? '';
        const targetUrl = new URL(`/api/${suffix}`, backendBaseUrl);

        // Forward query string
        for (const [k, v] of Object.entries(req.query)) {
            if (v !== undefined) targetUrl.searchParams.append(k, String(v));
        }

        const fetchOptions: RequestInit = {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const upstream = await fetch(targetUrl.toString(), fetchOptions);
        res.status(upstream.status);
        upstream.headers.forEach((value, name) => {
            if (!['transfer-encoding', 'connection'].includes(name.toLowerCase())) {
                res.setHeader(name, value);
            }
        });
        const body = await upstream.text();
        res.send(body);
    }));

    app.use('/gallery-api', router);

    // ── Media File Endpoint ───────────────────────────────────────────────────

    app.get('/media/*filePath', (req, res) => {
        // Path is the wildcard after /media/, URL-encoded
        const rawPath = (req.params as Record<string, string>).filePath ?? '';
        const filePath = decodeURIComponent(rawPath);

        if (!filePath) {
            res.status(400).send('Missing file path');
            return;
        }

        // Security: only allow absolute paths on disk (no path traversal)
        const normalized = path.normalize(filePath);
        const isAbsolute = path.isAbsolute(normalized);
        const isWslPath = normalized.startsWith('/mnt/');
        if (!isAbsolute && !isWslPath) {
            res.status(400).send('Only absolute file paths are supported');
            return;
        }

        if (!fs.existsSync(normalized)) {
            res.status(404).send('File not found');
            return;
        }

        const ext = path.extname(normalized).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif',
            '.webp': 'image/webp', '.bmp': 'image/bmp',
            '.tiff': 'image/tiff', '.tif': 'image/tiff',
            '.heic': 'image/heic', '.heif': 'image/heif',
            '.nef': 'image/x-nikon-nef', '.cr2': 'image/x-canon-cr2',
            '.arw': 'image/x-sony-arw', '.dng': 'image/x-adobe-dng',
        };
        const contentType = mimeTypes[ext] ?? 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        fs.createReadStream(normalized).pipe(res);
    });

    // ── SPA Fallback (production) ─────────────────────────────────────────────

    if (fs.existsSync(distDir)) {
        app.get('/*path', (_req, res) => {
            res.sendFile(path.join(distDir, 'index.html'));
        });
    }

    // ── Error Handler ─────────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        console.error('[Server] Unhandled error:', err);
        res.status(500).json({ ok: false, error: err.message });
    });

    // ── Start ─────────────────────────────────────────────────────────────────

    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
    app.listen(PORT, () => {
        console.log(`[Server] Browser-mode server running on http://localhost:${PORT}`);
        console.log(`[Server] Python backend URL: ${backendBaseUrl}`);
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseQueryOptions(query: Record<string, unknown>): Record<string, unknown> {
    const opts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === '') continue;
        // Express stores repeated params as string[]
        if (Array.isArray(v)) {
            opts[k] = v.map((item) => {
                const n = Number(item);
                return isNaN(n) ? item : n;
            });
            continue;
        }
        const str = String(v);
        if (str === 'true') { opts[k] = true; continue; }
        if (str === 'false') { opts[k] = false; continue; }
        const num = Number(str);
        if (!isNaN(num) && str !== '') { opts[k] = num; continue; }
        opts[k] = str;
    }
    return opts;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const out = { ...target };
    for (const [k, v] of Object.entries(source)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v) &&
            typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
            out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
        } else {
            out[k] = v;
        }
    }
    return out;
}

startServer().catch((e) => {
    console.error('[Server] Fatal startup error:', e);
    process.exit(1);
});
