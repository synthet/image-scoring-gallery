import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** One request the app made to the fake backend. */
export interface FakeRequest {
    method: string;
    path: string;
    /** SQL text for `/api/db/query`, otherwise null. */
    sql: string | null;
    params: unknown[];
}

/** Rows to answer one `/api/db/query` call with; return undefined to fall through to the default (no rows). */
export type SqlHandler = (sql: string, params: unknown[]) => unknown[] | undefined;

export interface FakeBackend {
    url: string;
    requests: FakeRequest[];
    /** Add a handler for SQL queries; later handlers win. A handler that throws answers HTTP 500. */
    onSql: (handler: SqlHandler) => void;
    /** Delay every SQL answer from now on, so a long operation can be interrupted reliably. */
    slowQueries: (ms: number) => void;
    close: () => Promise<void>;
}

/**
 * A small stand-in for the image-scoring backend, so e2e runs never touch a real backend or database.
 * It answers the health check and the HTTP SQL endpoint used by the `api` database engine
 * (`ApiConnector`: POST /api/db/query with `{ sql, params }`, answered with `{ rows }`). Everything else
 * is a 404, which the app already treats as "backend feature unavailable".
 */
export async function startFakeBackend(): Promise<FakeBackend> {
    const requests: FakeRequest[] = [];
    const handlers: SqlHandler[] = [];
    let queryDelayMs = 0;

    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
            const path = (req.url ?? '/').split('?')[0];
            let sql: string | null = null;
            let params: unknown[] = [];
            if (path === '/api/db/query') {
                try {
                    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { sql?: string; params?: unknown[] };
                    sql = body.sql ?? '';
                    params = body.params ?? [];
                } catch {
                    sql = '';
                }
            }
            requests.push({ method: req.method ?? 'GET', path, sql, params });

            const send = (status: number, body: unknown) => {
                setTimeout(() => {
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(body));
                }, path === '/api/db/query' ? queryDelayMs : 0);
            };
            if (path === '/api/health' || path === '/health') return send(200, { status: 'ok' });
            if (path === '/api/db/query' && sql !== null) {
                for (let i = handlers.length - 1; i >= 0; i--) {
                    let rows: unknown[] | undefined;
                    try {
                        rows = handlers[i](sql, params);
                    } catch (e) {
                        // A throwing handler simulates a database failure for this one query.
                        return send(500, { detail: e instanceof Error ? e.message : String(e) });
                    }
                    if (rows !== undefined) return send(200, { rows });
                }
                return send(200, { rows: [] });
            }
            return send(404, { detail: 'not available in the e2e fake backend' });
        });
    });

    // Live updates: accept the app's WebSocket (/ws/updates) with a bare RFC 6455 handshake and stay silent,
    // like a backend with nothing to report. Other upgrade paths are refused.
    const sockets = new Set<import('node:net').Socket>();
    server.on('upgrade', (req, socket) => {
        const path = (req.url ?? '/').split('?')[0];
        requests.push({ method: 'UPGRADE', path, sql: null, params: [] });
        const key = req.headers['sec-websocket-key'];
        if (path !== '/ws/updates' || typeof key !== 'string') {
            socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
            return;
        }
        const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
            + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
        sockets.add(socket as import('node:net').Socket);
        socket.on('close', () => sockets.delete(socket as import('node:net').Socket));
        socket.on('error', () => undefined);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        requests,
        onSql: (handler) => handlers.push(handler),
        slowQueries: (ms) => { queryDelayMs = ms; },
        close: () => new Promise<void>((resolve) => {
            for (const s of sockets) s.destroy();
            server.closeAllConnections();
            server.close(() => resolve());
        }),
    };
}
