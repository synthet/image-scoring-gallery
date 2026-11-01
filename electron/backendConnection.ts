/**
 * Tracks whether the Python backend (FastAPI) is reachable.
 *
 * - `check()` re-resolves the base URL (so a backend restarted on a new
 *   `webui.lock` port is picked up) and calls `/api/health`.
 * - `start()` runs the first check and keeps re-checking: faster while
 *   disconnected, slower while connected.
 * - `markDisconnected()` is the passive signal: any backend request that fails
 *   at the transport level flips the state without waiting for the next poll.
 *
 * Electron-free so it can be unit-tested; `main.ts` wires the deps.
 */

export type BackendConnectionStatus = 'unknown' | 'checking' | 'connected' | 'disconnected';

export type BackendConnectionState = {
    status: BackendConnectionStatus;
    url: string | null;
    lastCheckedAt: string | null;
    error: string | null;
};

export type BackendConnectionDeps = {
    resetBaseUrl: () => void;
    getBaseUrl: () => string;
    healthCheck: () => Promise<unknown>;
    onChange: (state: BackendConnectionState) => void;
    connectedIntervalMs?: number;
    disconnectedIntervalMs?: number;
    now?: () => Date;
};

export type BackendConnectionMonitor = {
    getState: () => BackendConnectionState;
    /** Runs a health check now. `announce` broadcasts a `checking` state first (manual reconnect). */
    check: (opts?: { announce?: boolean }) => Promise<BackendConnectionState>;
    markDisconnected: (error: string) => void;
    start: () => void;
    stop: () => void;
};

const CONNECTED_INTERVAL_MS = 60_000;
const DISCONNECTED_INTERVAL_MS = 30_000;

export function createBackendConnectionMonitor(deps: BackendConnectionDeps): BackendConnectionMonitor {
    const now = deps.now ?? (() => new Date());
    let state: BackendConnectionState = { status: 'unknown', url: null, lastCheckedAt: null, error: null };
    let inflight: Promise<BackendConnectionState> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;

    const setState = (next: BackendConnectionState) => {
        const changed = next.status !== state.status || next.url !== state.url;
        state = next;
        if (changed) deps.onChange(state);
    };

    const schedule = () => {
        if (!running) return;
        if (timer) clearTimeout(timer);
        const delay = state.status === 'connected'
            ? deps.connectedIntervalMs ?? CONNECTED_INTERVAL_MS
            : deps.disconnectedIntervalMs ?? DISCONNECTED_INTERVAL_MS;
        timer = setTimeout(() => { void check(); }, delay);
    };

    const safeUrl = (): string | null => {
        try {
            return deps.getBaseUrl();
        } catch {
            return null;
        }
    };

    const check = (opts?: { announce?: boolean }): Promise<BackendConnectionState> => {
        if (inflight) return inflight;
        deps.resetBaseUrl();
        const url = safeUrl();
        if (opts?.announce) setState({ ...state, status: 'checking', url });
        inflight = (async () => {
            try {
                await deps.healthCheck();
                setState({ status: 'connected', url, lastCheckedAt: now().toISOString(), error: null });
            } catch (e) {
                const error = e instanceof Error ? e.message : String(e);
                setState({ status: 'disconnected', url, lastCheckedAt: now().toISOString(), error });
            } finally {
                inflight = null;
                schedule();
            }
            return state;
        })();
        return inflight;
    };

    const markDisconnected = (error: string) => {
        if (state.status !== 'connected') return;
        setState({ ...state, status: 'disconnected', lastCheckedAt: now().toISOString(), error });
        schedule();
    };

    return {
        getState: () => state,
        check,
        markDisconnected,
        start: () => {
            if (running) return;
            running = true;
            void check();
        },
        stop: () => {
            running = false;
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}
