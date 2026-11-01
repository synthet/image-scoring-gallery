import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackendConnectionMonitor, type BackendConnectionDeps } from './backendConnection';

function makeDeps(overrides: Partial<BackendConnectionDeps> = {}) {
    let port = 7860;
    const defaults = {
        resetBaseUrl: vi.fn(),
        getBaseUrl: vi.fn(() => `http://127.0.0.1:${port}`),
        healthCheck: vi.fn(async () => ({ status: 'ok' })),
        onChange: vi.fn(),
        connectedIntervalMs: 1000,
        disconnectedIntervalMs: 500,
    };
    const deps = { ...defaults, ...overrides } as typeof defaults;
    return { deps, setPort: (p: number) => { port = p; } };
}

describe('backendConnection monitor', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('re-resolves the base URL and reports connected', async () => {
        const { deps } = makeDeps();
        const monitor = createBackendConnectionMonitor(deps);
        const state = await monitor.check();
        expect(deps.resetBaseUrl).toHaveBeenCalledTimes(1);
        expect(state.status).toBe('connected');
        expect(state.url).toBe('http://127.0.0.1:7860');
        expect(deps.onChange).toHaveBeenCalledTimes(1);
    });

    it('reports disconnected with the error and broadcasts only on change', async () => {
        const { deps } = makeDeps({ healthCheck: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) });
        const monitor = createBackendConnectionMonitor(deps);
        await monitor.check();
        await monitor.check();
        expect(monitor.getState()).toMatchObject({ status: 'disconnected', error: 'ECONNREFUSED' });
        expect(deps.onChange).toHaveBeenCalledTimes(1);
    });

    it('picks up a new port on the next check', async () => {
        const { deps, setPort } = makeDeps();
        const monitor = createBackendConnectionMonitor(deps);
        await monitor.check();
        setPort(7861);
        const state = await monitor.check();
        expect(state.url).toBe('http://127.0.0.1:7861');
        expect(deps.onChange).toHaveBeenCalledTimes(2);
    });

    it('announces checking on manual reconnect', async () => {
        const { deps } = makeDeps();
        const monitor = createBackendConnectionMonitor(deps);
        await monitor.check({ announce: true });
        expect(deps.onChange.mock.calls.map(([s]) => s.status)).toEqual(['checking', 'connected']);
    });

    it('markDisconnected flips a connected backend and is a no-op otherwise', async () => {
        const { deps } = makeDeps();
        const monitor = createBackendConnectionMonitor(deps);
        monitor.markDisconnected('fetch failed');
        expect(monitor.getState().status).toBe('unknown');
        await monitor.check();
        monitor.markDisconnected('fetch failed');
        expect(monitor.getState()).toMatchObject({ status: 'disconnected', error: 'fetch failed' });
    });

    it('polls after start and stops on stop', async () => {
        const { deps } = makeDeps();
        const monitor = createBackendConnectionMonitor(deps);
        monitor.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(deps.healthCheck).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(deps.healthCheck).toHaveBeenCalledTimes(2);
        monitor.stop();
        await vi.advanceTimersByTimeAsync(5000);
        expect(deps.healthCheck).toHaveBeenCalledTimes(2);
    });

    it('shares one in-flight check between concurrent callers', async () => {
        const { deps } = makeDeps();
        const monitor = createBackendConnectionMonitor(deps);
        await Promise.all([monitor.check(), monitor.check()]);
        expect(deps.healthCheck).toHaveBeenCalledTimes(1);
    });
});
