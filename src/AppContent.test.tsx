import { StrictMode, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AppContent from './AppContent';
import { readGalleryBrowserSnapshot, writeGalleryBrowserSnapshot } from './utils/galleryBrowserPersistence';

const state = vi.hoisted(() => ({ loading: true, refresh: vi.fn() }));
vi.mock('./hooks/useFolders', () => ({
    useFolders: () => ({ folders: [{ id: 7, title: 'Birds', path: '/birds' }], loading: state.loading, refresh: state.refresh }),
}));
vi.mock('./hooks/useDatabase', () => ({
    useImages: () => ({ images: [], totalCount: 0, loading: false, refresh: state.refresh }),
    useStacks: () => ({ stacks: [], totalCount: 0, loading: false, refresh: state.refresh }),
    useKeywords: () => ({ keywords: [], loading: false }),
}));
vi.mock('./hooks/useScoringSortOptions', () => ({
    useScoringSortOptions: () => ({ sortOptions: [{ value: 'score_general', label: 'Overall' }] }),
    isSortOptionValue: (value: string, options: { value: string }[]) => options.some((option) => option.value === value),
}));
vi.mock('./hooks/useGalleryWebSocket', () => ({ useGalleryWebSocket: vi.fn() }));
vi.mock('./hooks/useImageOpener', () => ({ useImageOpener: () => ({}) }));
vi.mock('./hooks/useAgentCullReview', () => ({ useAgentCullReview: () => ({}) }));
vi.mock('./hooks/useElectronListeners', () => ({ useElectronListeners: () => ({ toolView: null }) }));
vi.mock('./components/Layout/MainLayout', () => ({ MainLayout: ({ header }: { header: ReactNode }) => <>{header}</> }));
vi.mock('./components/Layout/NotificationTray', () => ({ NotificationTray: () => null }));
vi.mock('./components/Settings/SettingsModal', () => ({ SettingsModal: () => null }));
vi.mock('./components/Diagnostics/DiagnosticsModal', () => ({ DiagnosticsModal: () => null }));
vi.mock('./components/Import/ImportModal', () => ({ ImportModal: () => null }));
vi.mock('./components/Sync/SyncModal', () => ({ SyncModal: () => null }));
vi.mock('./components/Backup/BackupModal', () => ({ BackupModal: () => null }));
vi.mock('./bridge', () => ({ bridge: {
    getConfig: vi.fn().mockResolvedValue({ selection: { smartCoverEnabled: false } }),
    setSelectionPath: vi.fn().mockResolvedValue(true),
    getStackCacheStatus: vi.fn().mockResolvedValue({ stale: false }),
    getImagesBySubStack: vi.fn().mockResolvedValue([]),
} }));

beforeEach(() => {
    state.loading = true;
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
});

it('restores folder/stack state after folders load and normalizes a retired sort before saving', async () => {
    writeGalleryBrowserSnapshot({
        v: 1, currentView: 'gallery', selectedFolderId: 7, includeSubfolders: true,
        stacksMode: true, activeStackId: 10, activeSubStackId: 11,
        filters: { minRating: 3, sortBy: 'retired_model', order: 'DESC' }, smartCoverEnabled: false,
    });
    const { rerender } = render(<StrictMode><AppContent /></StrictMode>);
    // Loading must not overwrite the stored session with default state.
    expect(readGalleryBrowserSnapshot()?.filters.sortBy).toBe('retired_model');
    state.loading = false;
    rerender(<StrictMode><AppContent /></StrictMode>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sub-stack #11' })).toBeTruthy());
    expect(readGalleryBrowserSnapshot()).toMatchObject({
        selectedFolderId: 7, includeSubfolders: true, stacksMode: true,
        activeStackId: 10, activeSubStackId: 11,
        filters: { minRating: 3, sortBy: 'score_general' },
    });
});
