import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../hooks/useKeyboardLayer', () => ({
    useKeyboardLayer: vi.fn(),
}));

vi.mock('../../services/Logger', () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type VirtuosoGridMockProps = {
    totalCount?: number;
    itemContent?: (index: number) => ReactNode;
};

vi.mock('react-virtuoso', () => ({
    VirtuosoGrid: ({ totalCount = 0, itemContent }: VirtuosoGridMockProps) => (
        <div data-testid="virtuoso-grid">
            {Array.from({ length: totalCount }, (_, index) => (
                <div key={index}>{itemContent?.(index)}</div>
            ))}
        </div>
    ),
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

describe('GalleryGrid pick/reject status marks', () => {
    const pickedImage = {
        id: 1,
        file_path: 'D:/photos/DSC_1651.NEF',
        file_name: 'DSC_1651.NEF',
        thumbnail_path: 'D:/photos/thumbs/DSC_1651.jpg',
        score_general: 0.59,
        rating: 5,
        label: 'Blue',
        pick_status: 0,
    };

    it('shows status marks inside an opened sub-stack', () => {
        render(<GalleryGrid images={[pickedImage]} activeStackId={26888} activeSubStackId={11915} />);

        expect(screen.getByText('Picked')).toBeTruthy();
    });

    it('shows status marks in flat stack image view', () => {
        render(<GalleryGrid images={[pickedImage]} activeStackId={26888} activeSubStackId={null} />);

        expect(screen.getByText('Picked')).toBeTruthy();
    });

    it('shows Rejected in flat stack image view when pick_status is -1', () => {
        const rejectedImage = {
            ...pickedImage,
            pick_status: -1,
            label: null,
        };
        render(<GalleryGrid images={[rejectedImage]} activeStackId={26888} activeSubStackId={null} />);

        expect(screen.getByText('Rejected')).toBeTruthy();
    });

    it('does not show status marks in folder image view', () => {
        render(<GalleryGrid images={[pickedImage]} activeStackId={null} activeSubStackId={null} />);

        expect(screen.queryByText('Picked')).toBeNull();
    });

    it('does not show aggregate status marks on stack or sub-stack cards', () => {
        const stackCard = {
            ...pickedImage,
            image_count: 6,
            pick_count: 6,
            reject_count: 0,
            name: 'substack_26888_1',
            sub_stack_id: 11915,
        };

        const { rerender } = render(<GalleryGrid images={[]} stacks={[stackCard]} stacksMode />);
        expect(screen.queryByText('Pick 6')).toBeNull();
        expect(screen.queryByText('Picked')).toBeNull();

        rerender(
            <GalleryGrid
                images={[stackCard]}
                subStacksMode
                activeStackId={26888}
                activeSubStackId={null}
            />
        );
        expect(screen.queryByText('Pick 6')).toBeNull();
        expect(screen.queryByText('Picked')).toBeNull();
    });
});
