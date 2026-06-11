/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TagCloud } from './TagCloud';
import type { KeywordCloudEntry } from '../../../electron/types';

vi.mock('../../bridge', () => ({
  bridge: {
    getKeywordCloud: vi.fn(),
  },
}));

vi.mock('lucide-react', () => ({ Loader2: () => null }));

import { bridge } from '../../bridge';

const mockGetKeywordCloud = vi.mocked(bridge.getKeywordCloud);

const entries: KeywordCloudEntry[] = [
  { keyword_norm: 'bird', keyword_display: 'bird', count: 100 },
  { keyword_norm: 'rare', keyword_display: 'rare', count: 1 },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TagCloud', () => {
  it('calls onSelect when a tag is clicked', async () => {
    mockGetKeywordCloud.mockResolvedValue(entries);
    const onSelect = vi.fn();

    render(
      <TagCloud kind="general" onSelect={onSelect} />,
    );

    await waitFor(() => {
      expect(screen.getByText('bird')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('bird'));
    expect(onSelect).toHaveBeenCalledWith(entries[0]);
  });

  it('sizes higher-count tags larger than lower-count tags', async () => {
    mockGetKeywordCloud.mockResolvedValue(entries);

    render(<TagCloud kind="general" onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('bird')).toBeTruthy();
    });

    const birdSize = parseInt((screen.getByText('bird') as HTMLElement).style.fontSize, 10);
    const rareSize = parseInt((screen.getByText('rare') as HTMLElement).style.fontSize, 10);
    expect(birdSize).toBeGreaterThan(rareSize);
  });

  it('shows an empty message when there are no keywords', async () => {
    mockGetKeywordCloud.mockResolvedValue([]);

    render(
      <TagCloud kind="species" onSelect={() => {}} emptyMessage="Nothing here" />,
    );

    await waitFor(() => {
      expect(screen.getByText('Nothing here')).toBeTruthy();
    });
  });
});
