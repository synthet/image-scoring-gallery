import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';

const connection = vi.hoisted(() => ({ isConnected: false, error: null as string | null, retry: vi.fn() }));
vi.mock('./hooks/useDatabase', () => ({ useDatabase: () => connection }));
vi.mock('./hooks/useSessionRecorder', () => ({ useSessionRecorder: vi.fn() }));
vi.mock('./AppContent', () => ({ default: () => <input aria-label="Gallery selection" defaultValue="retained" /> }));
vi.mock('./components/FsMode/FsGallery', () => ({ FsGallery: () => <div>Folder mode</div> }));
vi.mock('./bridge', () => ({
    bridge: { onAppModeChanged: () => () => {} },
    setGalleryAppMode: vi.fn(),
}));
vi.mock('./services/Logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

afterEach(() => {
    cleanup();
    connection.isConnected = false;
    connection.error = null;
});

it('keeps the gallery mounted through disconnect and reconnect after initial connection', () => {
    const { rerender } = render(<App />);
    expect(screen.getByText('Connecting to services…')).toBeTruthy();
    connection.isConnected = true;
    rerender(<App />);
    const gallery = screen.getByRole('textbox', { name: 'Gallery selection' });
    connection.isConnected = false;
    connection.error = 'offline';
    rerender(<App />);
    expect(screen.getByText('Connection lost — retrying…')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Gallery selection' })).toBe(gallery);
    connection.isConnected = true;
    connection.error = null;
    rerender(<App />);
    expect(screen.queryByText('Connection lost — retrying…')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Gallery selection' })).toBe(gallery);
});
