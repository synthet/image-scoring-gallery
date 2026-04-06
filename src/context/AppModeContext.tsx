import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { bridge, setGalleryAppMode } from '../bridge';

export type GalleryAppMode = 'db' | 'folder';

interface AppModeContextValue {
    mode: GalleryAppMode;
    setMode: (m: GalleryAppMode) => void;
    /** Resolves true when the host switched to folder mode (Electron IPC succeeded). */
    enterFolderMode: () => Promise<boolean>;
    exitFolderMode: () => Promise<void>;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<GalleryAppMode>('db');

    useEffect(() => {
        setGalleryAppMode(mode);
    }, [mode]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.electron) return;
        void bridge.getGalleryMode().then((m) => {
            if (m === 'folder' || m === 'db') setModeState(m);
        });
    }, []);

    const setMode = useCallback((m: GalleryAppMode) => {
        setModeState(m);
    }, []);

    const enterFolderMode = useCallback(async (): Promise<boolean> => {
        try {
            await bridge.setGalleryMode('folder');
            setModeState('folder');
            return true;
        } catch (e) {
            console.error('[AppMode] setGalleryMode folder', e);
            return false;
        }
    }, []);

    const exitFolderMode = useCallback(async () => {
        try {
            await bridge.setGalleryMode('db');
        } catch (e) {
            console.error('[AppMode] setGalleryMode db', e);
        } finally {
            setModeState('db');
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
