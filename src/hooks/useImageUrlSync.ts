import { useEffect, useRef } from 'react';

const PARAM = 'image';

function readImageParam(): number | null {
    const raw = new URL(window.location.href).searchParams.get(PARAM);
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return id > 0 ? id : null;
}

function urlWithImage(id: number | null): string {
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, String(id));
    return url.pathname + url.search + url.hash;
}

interface UseImageUrlSyncParams {
    /** Id of the picture open in the viewer, or null when the viewer is closed. */
    openImageId: number | null;
    openImageById: (id: number) => Promise<boolean>;
    closeViewer: () => void;
    /** Web version only: the desktop app loads from a local file and has no address bar. */
    enabled?: boolean;
}

/**
 * Keeps `?image=<id>` in the address bar in sync with the viewer (#289), so a picture can be
 * bookmarked or shared. Opening a picture adds a history entry, moving to the next or previous one
 * replaces it, and Back closes the viewer. Loading a URL with `?image=` opens that picture.
 */
export function useImageUrlSync({
    openImageId,
    openImageById,
    closeViewer,
    enabled = typeof window !== 'undefined' && !window.electron,
}: UseImageUrlSyncParams): void {
    const openRef = useRef(openImageById);
    const closeRef = useRef(closeViewer);
    const currentIdRef = useRef(openImageId);
    /** True while the history entry for the open viewer is one this hook pushed. */
    const pushedRef = useRef(false);
    /** Id from the URL being opened on load; the URL is left alone until it opens or fails. */
    const bootIdRef = useRef<number | null>(null);

    useEffect(() => {
        openRef.current = openImageById;
        closeRef.current = closeViewer;
        currentIdRef.current = openImageId;
    });

    useEffect(() => {
        if (!enabled) return;
        const id = readImageParam();
        if (id === null) return;
        bootIdRef.current = id;
        void openRef.current(id).then((opened) => {
            if (opened || bootIdRef.current !== id) return;
            bootIdRef.current = null;
            window.history.replaceState(window.history.state, '', urlWithImage(null));
        });
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        const onPopState = () => {
            const id = readImageParam();
            if (id === null) {
                pushedRef.current = false;
                if (currentIdRef.current !== null) closeRef.current();
            } else if (id !== currentIdRef.current) {
                void openRef.current(id);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        if (bootIdRef.current !== null) {
            if (openImageId !== bootIdRef.current) return;
            bootIdRef.current = null;
        }
        const inUrl = readImageParam();
        if (openImageId === inUrl) return;
        if (openImageId !== null) {
            if (inUrl === null) {
                window.history.pushState({ galleryImage: openImageId }, '', urlWithImage(openImageId));
                pushedRef.current = true;
            } else {
                window.history.replaceState(window.history.state, '', urlWithImage(openImageId));
            }
        } else if (pushedRef.current) {
            pushedRef.current = false;
            window.history.back();
        } else {
            window.history.replaceState(window.history.state, '', urlWithImage(null));
        }
    }, [openImageId, enabled]);
}
