import { createContext, useContext } from 'react';

export type GalleryAppMode = 'db' | 'folder';

interface AppModeContextValue {
    mode: GalleryAppMode;
    setMode: (m: GalleryAppMode) => void;
    /** Resolves true when the host switched to folder mode (Electron IPC succeeded). */
    enterFolderMode: () => Promise<boolean>;
    exitFolderMode: () => Promise<void>;
}

export const AppModeContext = createContext<AppModeContextValue | null>(null);

export function useAppMode(): AppModeContextValue {
    const ctx = useContext(AppModeContext);
    if (!ctx) {
        throw new Error('useAppMode must be used within AppModeProvider');
    }
    return ctx;
}
