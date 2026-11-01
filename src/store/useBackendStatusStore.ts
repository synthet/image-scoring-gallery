import { create } from 'zustand';
import type { BackendConnectionState } from '../../electron/backendConnection';

export type { BackendConnectionState };

interface BackendStatusStore {
    state: BackendConnectionState;
    /** Increments on every disconnected → connected transition; depend on it to refetch backend data. */
    reconnectCount: number;
    setState: (state: BackendConnectionState) => void;
}

const INITIAL_STATE: BackendConnectionState = { status: 'unknown', url: null, lastCheckedAt: null, error: null };

/**
 * Live reachability of the Python backend, mirrored from the main-process
 * monitor (`electron/backendConnection.ts`). Not persisted: it is runtime state,
 * unlike the WebSocket preference in `useConnectionStore`.
 */
export const useBackendStatusStore = create<BackendStatusStore>((set) => ({
    state: INITIAL_STATE,
    reconnectCount: 0,
    setState: (state) => set((prev) => ({
        state,
        reconnectCount: prev.state.status === 'disconnected' && state.status === 'connected'
            ? prev.reconnectCount + 1
            : prev.reconnectCount,
    })),
}));

/**
 * True only once a check has confirmed the backend is down. `unknown` and
 * `checking` stay unblocked so the UI is not greyed out during startup.
 */
export function isBackendUnavailable(state: BackendConnectionState): boolean {
    return state.status === 'disconnected';
}

/** Selector hook for gating backend-only controls. */
export function useBackendUnavailable(): boolean {
    return useBackendStatusStore((s) => isBackendUnavailable(s.state));
}

export const BACKEND_UNAVAILABLE_HINT = 'Backend not connected — use Tools › Connect to Backend';
