import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useKeyboardLayer', () => ({
    useKeyboardLayer: vi.fn(),
}));

vi.mock('../../services/Logger', () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('react-virtuoso', () => ({
    VirtuosoGrid: () => <div data-testid="virtuoso-grid" />,
}));

import { GalleryGrid } from './GalleryGrid';

describe('GalleryGrid filter empty state', () => {
    it('shows filter empty message when filterEmptyActive and no images', () => {
        render(<GalleryGrid images={[]} filterEmptyActive />);
        expect(screen.getByText('No images match filters')).toBeTruthy();
        expect(screen.getByText(/Clear filters or change/)).toBeTruthy();
        expect(screen.queryByTestId('virtuoso-grid')).toBeNull();
    });

    it('renders grid shell when filterEmptyActive is false and no images', () => {
        render(<GalleryGrid images={[]} filterEmptyActive={false} />);
        expect(screen.queryByText('No images match filters')).toBeNull();
        expect(screen.getByTestId('virtuoso-grid')).toBeTruthy();
    });
});
