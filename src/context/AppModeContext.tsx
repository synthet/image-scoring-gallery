import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { bridge, setGalleryAppMode } from '../bridge';

export type GalleryAppMode = 'db' | 'folder';

interface AppModeContextValue {
    mode: GalleryAppMode;
    setMode: (m: GalleryAppMode) => void;
    enterFolderMode: () => Promise<void>;
    exitFolderMode: () => Promise<void>;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<GalleryAppMode>('db');

    useEffect(() => {
        setGalleryAppMode(mode);
    }, [mode]);

    const setMode = useCallback((m: GalleryAppMode) => {
        setModeState(m);
    }, []);

    const enterFolderMode = useCallback(async () => {
        setModeState('folder');
        try {
            await bridge.setGalleryMode('folder');
        } catch (e) {
            console.error('[AppMode] setGalleryMode folder', e);
        }
    }, []);

    const exitFolderMode = useCallback(async () => {
        setModeState('db');
        try {
            await bridge.setGalleryMode('db');
        } catch (e) {
            console.error('[AppMode] setGalleryMode db', e);
        }
    }, []);

    const value = useMemo(
        () => ({ mode, setMode, enterFolderMode, exitFolderMode }),
        [mode, setMode, enterFolderMode, exitFolderMode],
    );

    return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeContextValue {
    const ctx = useContext(AppModeContext);
    if (!ctx) {
        throw new Error('useAppMode must be used within AppModeProvider');
    }
    return ctx;
}
