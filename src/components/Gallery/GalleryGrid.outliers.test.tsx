import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GalleryGrid } from './GalleryGrid';
import type { ReactNode } from 'react';

vi.mock('react-virtuoso', () => ({
  VirtuosoGrid: ({ totalCount, itemContent }: { totalCount: number; itemContent: (index: number) => ReactNode }) => (
    <div>{Array.from({ length: totalCount }, (_, i) => <div key={i}>{itemContent(i)}</div>)}</div>
  ),
}));

describe('GalleryGrid outlier badge', () => {
  it('renders outlier badge with tooltip metadata', () => {
    render(
      <GalleryGrid
        images={[
          {
            id: 101,
            file_path: '/img/a.jpg',
            file_name: 'a.jpg',
            score_general: 0.5,
            rating: 3,
            label: null,
          },
        ]}
        highlightOutliers={true}
        outlierIds={new Set([101])}
        outlierMetaById={new Map([[101, { zScore: 2.95, outlierScore: 1.33, neighborSummary: 'Nearest: #5 (82%)' }]])}
      />,
    );

    const badge = screen.getByText('Outlier');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('title')).toBe('Outlier • z=2.95 • Nearest: #5 (82%)');
  });
});
