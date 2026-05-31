import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
