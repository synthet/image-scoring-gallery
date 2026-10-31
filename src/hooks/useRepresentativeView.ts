import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridge } from '../bridge';
import type {
    RepresentativeCard,
    RepresentativeFallbackReason,
    RepresentativePreviewResult,
} from '../../electron/representativePreview';

/**
 * Opt-in representative view for one folder (see docs/features/implemented/10-representative-preview.md).
 *
 * Kept apart from `useStacksMode`: study groups come from a manifest the operator opens, never from
 * persisted backend stacks. The hook only reads: it calls `loadRepresentativePreview` and nothing
 * that changes ratings, labels, flags or files. Folder changes, active filters and removed images
 * drop the view back to the ordinary grid.
 */
export function useRepresentativeView<T extends { id: number }>(folderId: number | undefined, filtersActive: boolean) {
    const [preview, setPreview] = useState<RepresentativePreviewResult | null>(null);
    const [rows, setRows] = useState<T[]>([]);
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeCard, setActiveCard] = useState<RepresentativeCard | null>(null);
    const [returnToId, setReturnToId] = useState<number | null>(null);

    const fallBack = useCallback((reason: RepresentativeFallbackReason, detail: string) => {
        setEnabled(false);
        setActiveCard(null);
        setRows([]);
        setPreview({ status: 'fallback', reason, detail });
    }, []);

    // A manifest describes one folder; never carry it across folders.
    useEffect(() => {
        setEnabled(false);
        setActiveCard(null);
        setRows([]);
        setPreview(null);
    }, [folderId]);

    useEffect(() => {
        if (enabled && filtersActive) {
            fallBack('filters_active', 'clear the sidebar filters to browse representatives');
        }
    }, [enabled, filtersActive, fallBack]);

    // The return highlight only needs to scroll once.
    useEffect(() => {
        if (returnToId == null) return;
        const timer = window.setTimeout(() => setReturnToId(null), 1500);
        return () => window.clearTimeout(timer);
    }, [returnToId]);

    const setRepresentativeMode = useCallback(async (on: boolean) => {
        if (!on) {
            setEnabled(false);
            setActiveCard(null);
            return;
        }
        if (folderId == null) {
            fallBack('no_folder', 'open a folder first');
            return;
        }
        if (filtersActive) {
            fallBack('filters_active', 'clear the sidebar filters to browse representatives');
            return;
        }
        setLoading(true);
        try {
            const result = await bridge.loadRepresentativePreview(folderId);
            setPreview(result.preview);
            setRows(result.preview.status === 'ok' ? (result.images as T[]) : []);
            setEnabled(result.preview.status === 'ok');
            setActiveCard(null);
        } catch (e) {
            fallBack('unreadable', e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [folderId, filtersActive, fallBack]);

    const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
    const cards = enabled && preview?.status === 'ok' ? preview.cards : null;

    const cardImages = useMemo(() => {
        if (!cards) return [];
        return cards.flatMap((c) => {
            const row = byId.get(c.representativeId);
            return row ? [{ ...row, image_count: c.memberIds.length }] : [];
        });
    }, [cards, byId]);

    const memberImages = useMemo(
        () => (activeCard ? activeCard.memberIds.flatMap((id) => byId.get(id) ?? []) : []),
        [activeCard, byId],
    );

    const openCard = useCallback((image: { id: number }) => {
        const card = cards?.find((c) => c.representativeId === image.id);
        if (card && card.memberIds.length > 1) setActiveCard(card);
    }, [cards]);

    const closeCard = useCallback(() => {
        if (activeCard) setReturnToId(activeCard.representativeId);
        setActiveCard(null);
    }, [activeCard]);

    /** An image left the folder (e.g. deleted from the viewer): the manifest no longer matches it. */
    const invalidate = useCallback(() => {
        if (enabled) fallBack('folder_changed', 'an image was removed from this folder; reopen the manifest');
    }, [enabled, fallBack]);

    return {
        enabled: cards !== null,
        loading,
        preview,
        activeCard,
        displayImages: activeCard ? memberImages : cardImages,
        hiddenCount: cards ? (preview?.status === 'ok' ? preview.frameCount - cards.length : 0) : 0,
        returnToId,
        setRepresentativeMode,
        openCard,
        closeCard,
        invalidate,
    };
}
