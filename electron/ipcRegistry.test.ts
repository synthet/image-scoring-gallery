/**
 * IPC registry contract: the preload (electron/preload.ts) and the main-process handlers must agree.
 * - every channel the preload invokes has exactly one ipcMain.handle, and every handler is invoked;
 * - every event the preload listens for is sent by the main process, and every sent event is heard;
 * - handlers wrapped in wrapIpcHandler (which return { ok, data, error }) are unwrapped by the preload.
 *
 * Static scan of the sources: no Electron needed. A channel registered from a
 * `for (const [channel, ...] of [...] as const)` table is read from that table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ELECTRON_DIR = path.resolve(__dirname);

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return sourceFiles(p);
        return e.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
    });
}

interface Registration {
    channel: string;
    file: string;
    wrapped: boolean;
}

function scanHandlers(): Registration[] {
    const out: Registration[] = [];
    for (const file of sourceFiles(ELECTRON_DIR)) {
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(/ipcMain\.handle\(\s*'([^']+)'\s*,\s*(wrapIpcHandler\b)?/g)) {
            out.push({ channel: m[1], file, wrapped: m[2] === 'wrapIpcHandler' });
        }
        // Table-driven registration: ipcMain.handle(channel, ...) inside for (const [channel, ...] of [...] as const)
        const loopCall = text.match(/ipcMain\.handle\(\s*channel\s*,\s*(\w+)/);
        if (loopCall) {
            const tables = [...text.matchAll(/for \(const \[channel[^\]]*\] of \[([\s\S]*?)\] as const\)/g)];
            expect(tables.length, `${file}: handle(channel) without a channel table`).toBeGreaterThan(0);
            for (const t of tables) {
                for (const c of t[1].matchAll(/\[\s*'([^']+)'/g)) {
                    out.push({ channel: c[1], file, wrapped: loopCall[1] === 'wrapIpcHandler' });
                }
            }
        }
    }
    return out;
}

const preload = fs.readFileSync(path.join(ELECTRON_DIR, 'preload.ts'), 'utf8');

/** Channel -> does the preload function that invokes it pass the response through unwrapEnvelope? */
function scanPreloadInvokes(): Map<string, boolean> {
    const lines = preload.split(/\r?\n/);
    const out = new Map<string, boolean>();
    // Match across lines: the channel string may sit on the line after `invoke(`.
    for (const m of preload.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)) {
        const startLine = preload.slice(0, m.index).split(/\r?\n/).length - 1;
        // The invoking function ends at the next top-level property of the exposed object.
        let body = '';
        for (let j = startLine; j < lines.length; j++) {
            if (j > startLine && /^ {4}\w+\s*:/.test(lines[j])) break;
            body += lines[j] + '\n';
        }
        out.set(m[1], /unwrapEnvelope/.test(body));
    }
    return out;
}

const handlers = scanHandlers();
const handled = new Set(handlers.map((h) => h.channel));
const invoked = scanPreloadInvokes();

function envelopeMismatches(): string[] {
    return handlers
        .filter((h) => h.wrapped && invoked.has(h.channel) && !invoked.get(h.channel))
        .map((h) => h.channel)
        .sort();
}

describe('IPC registry', () => {
    it('finds the registrations at all (scanner sanity)', () => {
        expect(handlers.length).toBeGreaterThan(100);
        expect(invoked.size).toBeGreaterThan(100);
    });

    it('registers every handler exactly once', () => {
        const counts = new Map<string, string[]>();
        for (const h of handlers) counts.set(h.channel, [...(counts.get(h.channel) ?? []), path.basename(h.file)]);
        const duplicates = [...counts].filter(([, files]) => files.length > 1);
        expect(duplicates).toEqual([]);
    });

    it('has a handler for every channel the preload invokes', () => {
        expect([...invoked.keys()].filter((c) => !handled.has(c)).sort()).toEqual([]);
    });

    it('exposes every handler through the preload (no dead channels)', () => {
        expect([...handled].filter((c) => !invoked.has(c)).sort()).toEqual([]);
    });

    it('sends every event the preload listens for, and listens for every event sent', () => {
        const listened = new Set([...preload.matchAll(/ipcRenderer\.(?:on|once)\(\s*'([^']+)'/g)].map((m) => m[1]));
        const sent = new Set(sourceFiles(ELECTRON_DIR).flatMap((f) =>
            [...fs.readFileSync(f, 'utf8').matchAll(/webContents\.send\(\s*'([^']+)'/g)].map((m) => m[1])));
        expect({
            listenedButNeverSent: [...listened].filter((c) => !sent.has(c)).sort(),
            sentButNeverListened: [...sent].filter((c) => !listened.has(c)).sort(),
        }).toEqual({ listenedButNeverSent: [], sentButNeverListened: [] });
    });

    it('unwraps the { ok, data, error } envelope of every wrapped handler', () => {
        expect(envelopeMismatches()).toEqual([]);
    });
});
