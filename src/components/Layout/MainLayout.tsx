import React from 'react';
import { JobProgressBar } from './JobProgressBar';
import '../../styles/layout.css';

interface MainLayoutProps {
    sidebar: React.ReactNode;
    content: React.ReactNode;
    header?: React.ReactNode;
    breadcrumbs?: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ sidebar, content, header, breadcrumbs }) => {
    return (
        <div className="app-container">
            <aside className="sidebar">
                {sidebar}
            </aside>
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
