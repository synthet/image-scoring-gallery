import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendStatusChip } from './BackendStatusChip';
import { useBackendStatusStore } from '../../store/useBackendStatusStore';
import { useNotificationStore } from '../../store/useNotificationStore';

const RESET = { status: 'unknown' as const, url: null, lastCheckedAt: null, error: null };

describe('BackendStatusChip', () => {
    afterEach(() => {
        useBackendStatusStore.setState({ state: RESET, reconnectCount: 0 });
        useNotificationStore.setState({ notifications: [] });
        vi.unstubAllGlobals();
    });

    it('renders nothing before the first status is known', () => {
        const { container } = render(<BackendStatusChip />);
        expect(container.firstChild).toBeNull();
    });

    it('shows offline and reconnects on click', async () => {
        const connected = { status: 'connected' as const, url: 'http://127.0.0.1:7860', lastCheckedAt: null, error: null };
        const reconnect = vi.fn().mockResolvedValue(connected);
        vi.stubGlobal('electron', { api: { reconnect } });
        useBackendStatusStore.getState().setState({ ...connected, status: 'disconnected', error: 'fetch failed' });

        render(<BackendStatusChip />);
        const chip = screen.getByTestId('backend-status-chip');
        expect(chip.textContent).toContain('Backend offline');

        fireEvent.click(chip);
        await waitFor(() => expect(screen.getByTestId('backend-status-chip').textContent).toBe('Backend'));
        expect(reconnect).toHaveBeenCalledTimes(1);
        expect(useBackendStatusStore.getState().reconnectCount).toBe(1);
        expect(useNotificationStore.getState().notifications[0]?.type).toBe('success');
    });
});
