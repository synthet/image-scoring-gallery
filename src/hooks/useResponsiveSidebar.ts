import { useCallback, useEffect, useState } from 'react';

/** Below this width the sidebar is an overlay drawer (see `.sidebar` in src/styles/layout.css). */
export const NARROW_LAYOUT_QUERY = '(max-width: 1100px)';

/**
 * Sidebar open state shared by the library view and folder mode: open on a wide window, closed on a
 * narrow one (and whenever the window becomes narrow), with toggle and close actions (#226).
 */
export function useResponsiveSidebar() {
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        const mq = window.matchMedia(NARROW_LAYOUT_QUERY);
        const onMatch = () => {
            if (mq.matches) setSidebarOpen(false);
        };
        onMatch();
        mq.addEventListener('change', onMatch);
        return () => mq.removeEventListener('change', onMatch);
    }, []);

    const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    return { sidebarOpen, toggleSidebar, closeSidebar };
}
