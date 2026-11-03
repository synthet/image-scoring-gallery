import React, { useEffect } from 'react';
import { NARROW_LAYOUT_QUERY } from '../../hooks/useResponsiveSidebar';
import { JobProgressBar } from './JobProgressBar';
import '../../styles/layout.css';

interface MainLayoutProps {
    sidebar: React.ReactNode;
    content: React.ReactNode;
    header?: React.ReactNode;
    breadcrumbs?: React.ReactNode;
    sidebarOpen?: boolean;
    /** Closes the sidebar. When set, the narrow-window overlay drawer closes on a backdrop click or Escape (#226). */
    onCloseSidebar?: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    sidebar,
    content,
    header,
    breadcrumbs,
    sidebarOpen = true,
    onCloseSidebar,
}) => {
    const sidebarClass = sidebarOpen ? 'sidebar sidebarOpen' : 'sidebar sidebarCollapsed';

    // Escape closes the drawer only while it overlays the content; on a wide window the sidebar is
    // part of the layout and Escape belongs to the rest of the app.
    useEffect(() => {
        if (!sidebarOpen || !onCloseSidebar) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            if (!window.matchMedia(NARROW_LAYOUT_QUERY).matches) return;
            onCloseSidebar();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [sidebarOpen, onCloseSidebar]);

    return (
        <div className="app-container">
            <aside className={sidebarClass}>
                {sidebar}
            </aside>
            {sidebarOpen && onCloseSidebar && (
                <div
                    className="sidebarBackdrop"
                    data-testid="sidebar-backdrop"
                    aria-hidden="true"
                    onClick={onCloseSidebar}
                />
            )}
            <main className="main-content">
                <header className="top-bar">
                    {header || <span>Image Gallery</span>}
                </header>
                {breadcrumbs && (
                    <div className="breadcrumbs-bar">
                        {breadcrumbs}
                    </div>
                )}
                <div className="content-area">
                    {content}
                </div>
                <JobProgressBar />
            </main>
        </div>
    );
};
