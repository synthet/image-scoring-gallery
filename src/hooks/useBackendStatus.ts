import { useEffect } from 'react';
import { bridge } from '../bridge';
import { useBackendStatusStore, type BackendConnectionState } from '../store/useBackendStatusStore';
import { useNotificationStore } from '../store/useNotificationStore';

/** Browser mode has no push channel; poll at the same pace the main process re-checks. */
const BROWSER_POLL_MS = 30_000;

function announceReconnectResult(state: BackendConnectionState | null): void {
    if (!state) return;
    const { addNotification } = useNotificationStore.getState();
    if (state.status === 'connected') {
        addNotification(`Connected to backend${state.url ? ` at ${state.url}` : ''}`, 'success');
    } else {
        addNotification(`Backend not reachable${state.url ? ` at ${state.url}` : ''}${state.error ? `: ${state.error}` : ''}`, 'error');
    }
}

/** Manual (re)connect: runs a health check now and toasts the result. */
export async function reconnectBackend(): Promise<BackendConnectionState | null> {
    const api = bridge.api;
    if (typeof api?.reconnect !== 'function') return null;
    const setState = useBackendStatusStore.getState().setState;
    const before = useBackendStatusStore.getState().state;
    // Keep `disconnected` while checking so reconnectCount still sees the transition.
    if (before.status !== 'disconnected') setState({ ...before, status: 'checking' });
    try {
        const state = await api.reconnect();
        if (state) setState(state);
        announceReconnectResult(state);
        return state;
    } catch (e) {
        const failed: BackendConnectionState = {
            ...useBackendStatusStore.getState().state,
            status: 'disconnected',
            error: e instanceof Error ? e.message : String(e),
        };
        setState(failed);
        announceReconnectResult(failed);
        return failed;
    }
}

/**
 * Mount once (AppContent): seeds the store from the main process and follows
 * `backend-status-changed`. Consumers that must refetch after a reconnect
 * depend on `reconnectCount` in the store.
 */
export function useBackendStatusSync(): void {
    useEffect(() => {
        const apply = (next: BackendConnectionState | null) => {
            if (!next) return;
            const prev = useBackendStatusStore.getState().state;
            // A transient `checking` between two failures must not erase `disconnected`.
            if (next.status === 'checking' && prev.status === 'disconnected') return;
            useBackendStatusStore.getState().setState(next);
        };
        let active = true;
        const api = bridge.api;
        const refresh = () => {
            if (typeof api?.getConnectionStatus !== 'function') return;
            void api.getConnectionStatus()
                .then((state) => { if (active) apply(state); })
                .catch(() => { /* status stays as-is; the next push or poll updates it */ });
        };
        refresh();

        const unsubscribers: Array<() => void> = [];
        if (typeof bridge.onBackendStatusChanged === 'function') {
            unsubscribers.push(bridge.onBackendStatusChanged((state) => { if (active) apply(state); }));
        } else {
            const timer = setInterval(refresh, BROWSER_POLL_MS);
            unsubscribers.push(() => clearInterval(timer));
        }
        if (typeof bridge.onBackendReconnectResult === 'function') {
            // Menu-triggered reconnect: the main process sends the result for the toast.
            unsubscribers.push(bridge.onBackendReconnectResult((state) => {
                if (!active) return;
                apply(state);
                announceReconnectResult(state);
            }));
        }
        return () => {
            active = false;
            unsubscribers.forEach((u) => u());
        };
    }, []);
}
