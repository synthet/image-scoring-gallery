import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainLayout } from './MainLayout';

describe('MainLayout sidebar', () => {
    it('applies sidebarOpen class when open', () => {
        const { container } = render(
            <MainLayout
                sidebarOpen
                sidebar={<div>Sidebar filters</div>}
                content={<div>Main area</div>}
            />,
        );
        const aside = container.querySelector('aside');
        expect(aside?.className).toContain('sidebarOpen');
        expect(screen.getByText('Sidebar filters')).toBeTruthy();
    });

    it('applies sidebarCollapsed class when closed', () => {
        const { container } = render(
            <MainLayout
                sidebarOpen={false}
                sidebar={<div>Sidebar filters</div>}
                content={<div>Main area</div>}
            />,
        );
        const aside = container.querySelector('aside');
        expect(aside?.className).toContain('sidebarCollapsed');
    });
});

describe('MainLayout overlay drawer (#226)', () => {
    afterEach(() => vi.unstubAllGlobals());

    const narrowWindow = (narrow: boolean) =>
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: narrow,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }));

    it('closes the open drawer when its backdrop is clicked', () => {
        narrowWindow(true);
        const onCloseSidebar = vi.fn();
        render(<MainLayout sidebarOpen onCloseSidebar={onCloseSidebar} sidebar={<div />} content={<div />} />);
        fireEvent.click(screen.getByTestId('sidebar-backdrop'));
        expect(onCloseSidebar).toHaveBeenCalledTimes(1);
    });

    it('closes the open drawer on Escape when the window is narrow', () => {
        narrowWindow(true);
        const onCloseSidebar = vi.fn();
        render(<MainLayout sidebarOpen onCloseSidebar={onCloseSidebar} sidebar={<div />} content={<div />} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCloseSidebar).toHaveBeenCalledTimes(1);
    });

    it('leaves Escape alone when the sidebar is in the page flow (wide window)', () => {
        narrowWindow(false);
        const onCloseSidebar = vi.fn();
        render(<MainLayout sidebarOpen onCloseSidebar={onCloseSidebar} sidebar={<div />} content={<div />} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCloseSidebar).not.toHaveBeenCalled();
    });

    it('renders no backdrop while the sidebar is closed', () => {
        narrowWindow(true);
        render(<MainLayout sidebarOpen={false} onCloseSidebar={vi.fn()} sidebar={<div />} content={<div />} />);
        expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();
    });
});
