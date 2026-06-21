import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AgentCullRecommendation } from '../../types/agentCullReview';

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

describe('GalleryGrid agent cull overlays', () => {
    const img = {
        id: 100,
        file_path: 'D:/photos/DSC_0100.NEF',
        file_name: 'DSC_0100.NEF',
        thumbnail_path: 'D:/photos/thumbs/DSC_0100.jpg',
        score_general: 0.42,
        rating: 0,
        label: null,
    };

    const removeRec: AgentCullRecommendation = {
        id: 7,
        review_group_id: 1,
        image_id: 100,
        agent_decision: 'remove',
        final_decision: 'remove',
        confidence: 0.9,
        reason: 'Duplicate frame',
        candidate_status: 'proposed',
    };

    const advisoryRec: AgentCullRecommendation = {
        id: 8,
        review_group_id: 1,
        image_id: 100,
        agent_decision: 'advisory',
        final_decision: 'keep',
        candidate_status: 'pick_quality_advisory',
    };

    it('renders a Remove badge and hover actions for a removable recommendation', () => {
        const onAgentAction = vi.fn();
        render(
            <GalleryGrid
                images={[img]}
                activeStackId={123}
                agentRecommendations={new Map([[100, removeRec]])}
                onAgentAction={onAgentAction}
            />,
        );

        const badge = screen.getByTestId('agent-grid-badge-100');
        expect(badge.textContent).toBe('Remove');

        fireEvent.click(screen.getByTestId('agent-grid-approve-100'));
        expect(onAgentAction).toHaveBeenCalledWith(removeRec, 'approve');

        fireEvent.click(screen.getByTestId('agent-grid-dismiss-100'));
        expect(onAgentAction).toHaveBeenCalledWith(removeRec, 'reject');
    });

    it('shows an Advisory badge but no approve/dismiss controls for advisories', () => {
        render(
            <GalleryGrid
                images={[img]}
                activeStackId={123}
                agentRecommendations={new Map([[100, advisoryRec]])}
                onAgentAction={vi.fn()}
            />,
        );

        expect(screen.getByTestId('agent-grid-badge-100').textContent).toBe('Advisory');
        expect(screen.queryByTestId('agent-grid-approve-100')).toBeNull();
        expect(screen.queryByTestId('agent-grid-dismiss-100')).toBeNull();
    });

    it('renders no agent overlay when there is no recommendation for the image', () => {
        render(<GalleryGrid images={[img]} activeStackId={123} agentRecommendations={new Map()} />);
        expect(screen.queryByTestId('agent-grid-badge-100')).toBeNull();
    });
});
