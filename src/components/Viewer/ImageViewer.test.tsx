import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useKeyboardLayer', () => ({
  useKeyboardLayer: vi.fn(),
}));

vi.mock('../../hooks/useDatabase', () => ({
  usePropagateTags: () => ({
    propagate: vi.fn(),
    loading: false,
    error: null,
  }),
}));

const addNotification = vi.fn();
vi.mock('../../store/useNotificationStore', () => ({
  useNotificationStore: (selector: (state: { addNotification: typeof addNotification }) => unknown) =>
    selector({ addNotification }),
}));

import { ImageViewer } from './ImageViewer';

type ElectronMock = {
  getImageDetails: ReturnType<typeof vi.fn>;
  readExif: ReturnType<typeof vi.fn>;
  setCurrentExportImageContext: ReturnType<typeof vi.fn>;
  updateImageDetails: ReturnType<typeof vi.fn>;
  deleteImage: ReturnType<typeof vi.fn>;
  api: {
    propagateTags: ReturnType<typeof vi.fn>;
  };
};

const baseImage = {
  id: 101,
  file_path: '/photos/set1/image.jpg',
  file_name: 'image.jpg',
  score_general: 0.8,
  rating: 2,
  label: null,
  keywords: 'manual',
};

function renderViewer() {
  render(
    <ImageViewer
      image={baseImage}
      onClose={vi.fn()}
      allImages={[baseImage]}
      currentIndex={0}
    />
  );
}

describe('ImageViewer tag propagation suggestions', () => {
  let electron: ElectronMock;

  beforeEach(() => {
    localStorage.clear();
    addNotification.mockReset();

    electron = {
      getImageDetails: vi.fn().mockResolvedValue({ ...baseImage }),
      readExif: vi.fn().mockResolvedValue({}),
      setCurrentExportImageContext: vi.fn().mockResolvedValue(true),
      updateImageDetails: vi.fn().mockResolvedValue(true),
      deleteImage: vi.fn().mockResolvedValue(true),
      api: {
        propagateTags: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: {
            suggestions: [
              { keyword: 'sunset', confidence: 0.93 },
              { keyword: 'noise', confidence: 0.72 },
            ],
          },
        }),
      },
    };

    (window as any).electron = electron;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob(['preview'], { type: 'image/jpeg' }),
    }));
  });

  afterEach(() => {
    (window as any).electron = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads dry-run suggestions when entering edit mode', async () => {
    renderViewer();

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    await waitFor(() => {
      expect(electron.api.propagateTags).toHaveBeenCalledWith(expect.objectContaining({
        dry_run: true,
        k: 5,
        min_similarity: 0.85,
        min_keyword_confidence: 0.85,
      }));
    });

    expect(await screen.findByText('sunset')).not.toBeNull();
    expect(screen.queryByText('noise')).toBeNull();
  });

  it('accepts a single suggestion and persists keywords', async () => {
    renderViewer();
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    await screen.findByText('sunset');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(electron.updateImageDetails).toHaveBeenCalledWith(baseImage.id, {
        keywords: 'manual, sunset',
      });
    });

    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('rejects a single suggestion and suppresses it on refresh', async () => {
    renderViewer();
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    await screen.findByText('sunset');
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      expect(screen.queryByText('sunset')).toBeNull();
    });

    const callsBeforeRefresh = electron.api.propagateTags.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(electron.api.propagateTags.mock.calls.length).toBeGreaterThan(callsBeforeRefresh);
      expect(screen.queryByText('sunset')).toBeNull();
    });
  });

  it('applies all high-confidence suggestions at once', async () => {
    electron.api.propagateTags.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        suggestions: [
          { keyword: 'sunset', confidence: 0.93 },
          { keyword: 'landscape', confidence: 0.91 },
        ],
      },
    });

    renderViewer();
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    await screen.findByText('sunset');
    await screen.findByText('landscape');

    fireEvent.click(screen.getByRole('button', { name: /apply all/i }));

    await waitFor(() => {
      expect(electron.updateImageDetails).toHaveBeenCalledWith(baseImage.id, {
        keywords: 'manual, sunset, landscape',
      });
    });

    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});
