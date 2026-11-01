import { useBackendStatusStore } from '../../store/useBackendStatusStore';
import { reconnectBackend } from '../../hooks/useBackendStatus';
import styles from './BackendStatusChip.module.css';

const LABEL: Record<string, string> = {
    connected: 'Backend',
    disconnected: 'Backend offline',
    checking: 'Checking backend…',
    unknown: 'Backend',
};

/** Header chip: backend reachability; click runs a reconnect (same as Tools › Connect to Backend). */
export function BackendStatusChip() {
    const state = useBackendStatusStore((s) => s.state);
    // Browser/folder bridges without a status source never leave `unknown`: show nothing.
    if (state.status === 'unknown') return null;

    const checking = state.status === 'checking';
    const title = state.status === 'connected'
        ? `Backend connected${state.url ? ` at ${state.url}` : ''}. Click to re-check.`
        : state.status === 'disconnected'
            ? `Backend not reachable${state.url ? ` at ${state.url}` : ''}${state.error ? ` (${state.error})` : ''}. Scoring, AI search, agent review and diagnostics need it. Click to reconnect.`
            : 'Checking backend connection…';

    return (
        <button
            type="button"
            className={`${styles.chip} ${styles[state.status] ?? ''}`}
            onClick={() => { void reconnectBackend(); }}
            disabled={checking}
            title={title}
            aria-label={title}
            data-testid="backend-status-chip"
        >
            <span className={styles.dot} aria-hidden="true" />
            {LABEL[state.status]}
        </button>
    );
}
