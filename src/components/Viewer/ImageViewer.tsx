import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, Star, FileText, Edit2, Trash2, Save, RotateCcw, AlertTriangle, Search, FolderOpen, Tag, Loader2, Wrench } from 'lucide-react';
import { SimilarSearchDrawer } from './SimilarSearchDrawer';
import { ConfirmDialog } from '../Shared/ConfirmDialog';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useKeyboardLayer } from '../../hooks/useKeyboardLayer';
import { usePropagateTags } from '../../hooks/useDatabase';
import { toMediaUrl } from '../../utils/mediaUrl';
import { bridge } from '../../bridge';
import { STAGE_DISPLAY } from '../../constants/pipelineLabels';
import type { TagPropagationRequest } from '../../../electron/apiTypes';
import { bakeExifOrientationToBlob } from '../../utils/exportImageBake';

interface Image {
    id: number;
    file_path: string;
    file_name: string;
    score_general: number;
    score_technical?: number;
    score_aesthetic?: number;
    score_spaq?: number;
    score_ava?: number;
    score_liqe?: number;
    rating: number;
    label: string | null;
    created_at?: string;
    thumbnail_path?: string;
    title?: string;
    description?: string;
    keywords?: string;
    stack_id?: number | null;
    burst_uuid?: string;
    job_id?: string;
    folder_id?: number;
    win_path?: string;
    file_exists?: boolean;
    image_uuid?: string;

    exif_iso?: number | null;
    exif_shutter?: string | null;
    exif_aperture?: string | null;
    exif_focal_length?: string | null;
    exif_model?: string | null;
    exif_lens_model?: string | null;
}

interface ImageViewerProps {
    image: Image;
    onClose: () => void;
    allImages?: Image[];
    currentIndex?: number;
    onNavigate?: (newIndex: number) => void;
    onDelete?: (id: number) => void;
    onOpenFolder?: (folderId: number) => void;
    onOpenImageById?: (id: number) => Promise<boolean>;
    /** When set (e.g. opening viewer from a “similar” entry), opens the similar-images drawer for this id */
    initialSimilarSearchImageId?: number | null;
    /** Read-only: no DB fetch, no edits, no similar search (filesystem-only / light mode). */
    readOnlyFilesystemMode?: boolean;
}

const isWebSafe = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
};

const isRaw = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['nef', 'nrw', 'cr2', 'cr3', 'arw', 'orf', 'rw2', 'dng'].includes(ext);
};

const normalizeKeywords = (keywords: string): string => (
    keywords
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
        .join(', ')
);

type SuggestionDecision = 'pending' | 'accepted' | 'rejected';

interface SuggestedKeywordRow {
    keyword: string;
    confidence: number;
    decision: SuggestionDecision;
}

const LOCAL_REJECTION_KEY = 'image-viewer-tag-rejections-v1';
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const SIMILAR_SEARCH_ENABLED = false;

const parseKeywordText = (keywords?: string | null): string[] => (
    (keywords || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
);

const confidenceToPercent = (confidence: number): string =>
    `${Math.round(confidence * 100)}%`;

const getFolderPathFromFilePath = (filePath?: string): string | null => {
    if (!filePath) return null;
    const normalized = filePath.replace(/[\\/]+$/, '');
    const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));

    if (lastSeparator < 0) return null;
    if (lastSeparator === 0) return normalized[0];
    if (lastSeparator === 2 && /^[a-zA-Z]:[\\/]/.test(normalized)) {
        return normalized.slice(0, 3);
    }

    return normalized.slice(0, lastSeparator);
};

const ScoreBar = ({ label, value, color = '#ff9800' }: { label: string, value: number, color?: string }) => (
    <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
            <span>{label}</span>
            <span>{Math.round(value * 100)}%</span>
        </div>
        <div style={{ height: 4, background: '#333', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${value * 100}%`, height: '100%', background: color }} />
        </div>
    </div>
);

interface ExifData {
    ISO?: number;
    ShutterSpeed?: string;
    Aperture?: number;
    FocalLength?: string;
    Model?: string;
    LensModel?: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
    image: initialImage,
    onClose,
    allImages = [],
    currentIndex = 0,
    onNavigate,
    onDelete,
    onOpenFolder,
    onOpenImageById,
    initialSimilarSearchImageId = null,
    readOnlyFilesystemMode = false,
}) => {
    const [image, setImage] = React.useState<Image>(initialImage);
    const [detailsLoaded, setDetailsLoaded] = React.useState(() => readOnlyFilesystemMode);
    const [detailsError, setDetailsError] = React.useState<string | null>(null);
    const [exifData, setExifData] = React.useState<ExifData | null>(null);
    const [exifLoading, setExifLoading] = React.useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [fixMetadataBusy, setFixMetadataBusy] = React.useState(false);
    const addNotification = useNotificationStore(state => state.addNotification);

    const handleFixImageMetadata = useCallback(async () => {
        const path = image.file_path?.trim();
        if (!path) {
            addNotification('No database file path for this image', 'error');
            return;
        }
        setFixMetadataBusy(true);
        try {
            const result = await bridge.api.fixImageMetadata(path);
            if (result?.success) {
                addNotification(result.message || 'Metadata synced from file on server', 'success');
                const details = await bridge.getImageDetails(image.id);
                if (details) {
                    setImage(details);
                }
            } else {
                addNotification(result?.message || 'Server did not update metadata', 'warning');
            }
        } catch (e) {
            console.error('[ImageViewer] fixImageMetadata failed', e);
            addNotification('Fix metadata request failed', 'error');
        } finally {
            setFixMetadataBusy(false);
        }
    }, [addNotification, image.file_path, image.id]);

    useKeyboardLayer('drawer', useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
            return true;
        } else if (e.key === 'ArrowLeft' && onNavigate && currentIndex > 0) {
            onNavigate(currentIndex - 1);
            return true;
        } else if (e.key === 'ArrowRight' && onNavigate && allImages && currentIndex < allImages.length - 1) {
            onNavigate(currentIndex + 1);
            return true;
        }
        return false;
    }, [onClose, onNavigate, currentIndex, allImages]), !isDeleteDialogOpen);

    const currentIdRef = useRef(initialImage.id);

    // Update image when navigating. Only update when target image ID changes to avoid
    // infinite loops when parent passes a new allImages array reference each render.
    useEffect(() => {
        if (currentIndex >= 0 && allImages && allImages[currentIndex]) {
            const target = allImages[currentIndex];
            if (currentIdRef.current !== target.id) {
                currentIdRef.current = target.id;
                setImage(target);
                setDetailsLoaded(false);
            }
        } else if (currentIndex === -1) {
            if (currentIdRef.current !== initialImage.id) {
                currentIdRef.current = initialImage.id;
                setImage(initialImage);
                setDetailsLoaded(false);
            }
        }
    }, [currentIndex, allImages, initialImage]);

    // Fetch full details
    useEffect(() => {
        if (readOnlyFilesystemMode) {
            setDetailsLoaded(true);
            setDetailsError(null);
            return;
        }
        let active = true;
        const fetchDetails = async () => {
            setDetailsError(null);
            try {
                console.log(`[ImageViewer] Fetching details for image ID: ${image.id}`);
                const details = await bridge.getImageDetails(image.id);
                
                if (!active) return;

                if (details) {
                    setImage(details);
                    console.log('[ImageViewer] Details loaded successfully');
                } else {
                    console.warn('[ImageViewer] Image details returned null');
                    setDetailsError('Metadata not found');
                }
            } catch (e) {
                console.error("Failed to fetch image details:", e);
                if (active) setDetailsError('Fetch failed');
            } finally {
                if (active) {
                    setDetailsLoaded(true);
                }
            }
        };
        fetchDetails();
        return () => { active = false; };
    }, [image.id, readOnlyFilesystemMode]);

    // Folder mode: single merged metadata load (EXIF + optional .xmp sidecar)
    useEffect(() => {
        if (!readOnlyFilesystemMode) {
            return;
        }
        let active = true;
        const pathSchema = image.win_path || image.file_path;
        setExifData(null);
        setExifLoading(true);
        if (!pathSchema) {
            setExifLoading(false);
            return;
        }
        void (async () => {
            try {
                const meta = await bridge.readImageMetadata(pathSchema);
                if (!active) return;
                const d = meta.detail;
                setImage((prev) => ({
                    ...prev,
                    title: d.title ?? prev.title,
                    description: d.description ?? prev.description,
                    keywords: d.keywords ?? prev.keywords,
                    rating: d.rating ?? prev.rating,
                    label: d.label ?? prev.label,
                    exif_iso: d.exif_iso ?? prev.exif_iso,
                    exif_shutter: d.exif_shutter ?? prev.exif_shutter,
                    exif_aperture: d.exif_aperture ?? prev.exif_aperture,
                    exif_focal_length: d.exif_focal_length ?? prev.exif_focal_length,
                    exif_model: d.exif_model ?? prev.exif_model,
                    exif_lens_model: d.exif_lens_model ?? prev.exif_lens_model,
                }));
                setExifData({
                    ISO: d.exif_iso ?? undefined,
                    ShutterSpeed: d.exif_shutter ?? undefined,
                    Aperture: d.exif_aperture ? Number(d.exif_aperture) : undefined,
                    FocalLength: d.exif_focal_length ?? undefined,
                    Model: d.exif_model ?? undefined,
                    LensModel: d.exif_lens_model ?? undefined,
                });
            } catch (e) {
                console.error('[ImageViewer] readImageMetadata failed', e);
            } finally {
                if (active) setExifLoading(false);
            }
        })();
        return () => { active = false; };
    }, [readOnlyFilesystemMode, image.id, image.win_path, image.file_path]);

    // Lazy load or use DB EXIF data
    useEffect(() => {
        if (readOnlyFilesystemMode) {
            return;
        }
        let active = true;
        console.log('[ImageViewer] EXIF effect triggered', { 
            id: image.id, 
            hasDbExif: !!(image.exif_iso || image.exif_shutter || image.exif_aperture) 
        });
        setExifData(null);
        setExifLoading(false);

        // First check if EXIF is populated from our recent specific DB fetch
        if (
            image.exif_iso || image.exif_shutter || image.exif_aperture ||
            image.exif_focal_length || image.exif_model || image.exif_lens_model
        ) {
            console.log('[ImageViewer] Using DB EXIF data', image.id);
            setExifData({
                ISO: image.exif_iso || undefined,
                ShutterSpeed: image.exif_shutter || undefined,
                Aperture: image.exif_aperture ? Number(image.exif_aperture) : undefined,
                FocalLength: image.exif_focal_length || undefined,
                Model: image.exif_model || undefined,
                LensModel: image.exif_lens_model || undefined
            });
            setExifLoading(false);
            return;
        }

        const fetchExif = async () => {
            const pathSchema = image.win_path || image.file_path;
            if (!pathSchema) {
                console.warn('[ImageViewer] No path for EXIF fetch', image.id);
                return;
            }

            console.log('[ImageViewer] Fetching lazy EXIF for', pathSchema);
            setExifLoading(true);
            try {
                const exif = await bridge.readExif(pathSchema);
                console.log('[ImageViewer] Lazy EXIF result:', { 
                    id: image.id, 
                    success: !!exif,
                    active 
                });
                if (active && exif) {
                    setExifData({
                        ISO: exif.ISO as number | undefined,
                        ShutterSpeed: exif.ShutterSpeed as string | undefined,
                        Aperture: exif.Aperture as number | undefined,
                        FocalLength: exif.FocalLength as string | undefined,
                        Model: exif.Model as string | undefined,
                        LensModel: exif.LensModel as string | undefined
                    });
                }
            } catch (e) {
                console.error('Failed to parse lazy EXIF', e);
            } finally {
                if (active) {
                    console.log('[ImageViewer] Setting exifLoading to false after fetch', image.id);
                    setExifLoading(false);
                }
            }
        };

        fetchExif();
        return () => { active = false; };
    }, [
        image.id, image.win_path, image.file_path, image.exif_iso, image.exif_shutter,
        image.exif_aperture, image.exif_focal_length, image.exif_model, image.exif_lens_model
    ]);

    // Editing & Drawer State
    const [isEditing, setIsEditing] = useState(false);
    const effectiveEditing = !readOnlyFilesystemMode && isEditing;
    const { propagate, loading: propagateLoading } = usePropagateTags();
    const [suggestionRows, setSuggestionRows] = useState<SuggestedKeywordRow[]>([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [suggestionsLoadError, setSuggestionsLoadError] = useState<string | null>(null);
    const [isSimilarDrawerOpen, setIsSimilarDrawerOpen] = useState(false);
    const [similarSearchImageId, setSimilarSearchImageId] = useState<number | null>(null);
    const editKeywordsRef = useRef('');
    const [editForm, setEditForm] = useState({
        title: '',
        description: '',
        rating: 0,
        label: '',
        keywords: ''
    });
    const [suppressedByImage, setSuppressedByImage] = useState<Record<number, string[]>>(() => {
        try {
            const saved = localStorage.getItem(LOCAL_REJECTION_KEY);
            if (!saved) return {};
            const parsed = JSON.parse(saved) as Record<string, string[]>;
            return Object.fromEntries(
                Object.entries(parsed).map(([key, value]) => [Number(key), Array.isArray(value) ? value : []])
            );
        } catch {
            return {};
        }
    });

    useEffect(() => {
        localStorage.setItem(LOCAL_REJECTION_KEY, JSON.stringify(suppressedByImage));
    }, [suppressedByImage]);

    const extractSuggestedKeywords = useCallback((payload: unknown): SuggestedKeywordRow[] => {
        if (!payload || typeof payload !== 'object') {
            return [];
        }

        const data = payload as Record<string, unknown>;
        const candidates = (
            data.suggestions ||
            data.keywords ||
            (Array.isArray(data.images)
                ? (data.images as unknown[]).find(item => {
                    if (!item || typeof item !== 'object') return false;
                    const row = item as Record<string, unknown>;
                    return Number(row.image_id) === image.id || Number(row.id) === image.id;
                })
                : null) ||
            data.image ||
            data
        ) as unknown;

        const keywordRows = Array.isArray(candidates)
            ? candidates
            : (candidates && typeof candidates === 'object'
                ? ((candidates as Record<string, unknown>).suggestions ||
                    (candidates as Record<string, unknown>).keywords)
                : null);

        if (!Array.isArray(keywordRows)) {
            return [];
        }

        return keywordRows
            .map((item): SuggestedKeywordRow | null => {
                if (typeof item === 'string') {
                    return { keyword: item.trim(), confidence: 1, decision: 'pending' };
                }
                if (!item || typeof item !== 'object') return null;

                const row = item as Record<string, unknown>;
                const keyword = String(row.keyword ?? row.tag ?? row.name ?? '').trim();
                if (!keyword) return null;

                const confidenceCandidate = Number(row.confidence ?? row.score ?? row.similarity ?? 0);
                const confidence = Number.isFinite(confidenceCandidate) ? confidenceCandidate : 0;

                return { keyword, confidence, decision: 'pending' };
            })
            .filter((row): row is SuggestedKeywordRow => Boolean(row?.keyword));
    }, [image.id]);

    const loadSuggestedKeywords = useCallback(async () => {
        const folderPath = getFolderPathFromFilePath(image.win_path || image.file_path);
        if (!folderPath) return;

        setSuggestionsLoading(true);
        setSuggestionsLoadError(null);
        try {
            const payload: TagPropagationRequest = {
                folder_path: folderPath,
                dry_run: true,
                k: 5,
                min_similarity: HIGH_CONFIDENCE_THRESHOLD,
                min_keyword_confidence: HIGH_CONFIDENCE_THRESHOLD,
                write_mode: 'replace_missing_only',
                max_keywords: 10,
            };
            const result = await bridge.api.propagateTags(payload);
            const existingKeywords = new Set(parseKeywordText(editKeywordsRef.current).map(tag => tag.toLowerCase()));
            const suppressedSet = new Set((suppressedByImage[image.id] || []).map(tag => tag.toLowerCase()));

            const nextRows = extractSuggestedKeywords(result?.data)
                .filter(row =>
                    row.confidence >= HIGH_CONFIDENCE_THRESHOLD &&
                    !existingKeywords.has(row.keyword.toLowerCase()) &&
                    !suppressedSet.has(row.keyword.toLowerCase())
                )
                .map(row => ({ ...row, decision: 'pending' as const }));

            setSuggestionRows(nextRows);
        } catch (e) {
            console.error('Failed to load keyword suggestions:', e);
            setSuggestionRows([]);
            const msg = e instanceof Error ? e.message : 'Failed to load suggestions';
            setSuggestionsLoadError(msg);
            addNotification(`AI keyword suggestions: ${msg}`, 'error');
        } finally {
            setSuggestionsLoading(false);
        }
    }, [addNotification, extractSuggestedKeywords, image.file_path, image.id, image.win_path, suppressedByImage]);

    const persistKeywords = useCallback(async (keywords: string[]): Promise<boolean> => {
        const normalized = normalizeKeywords(keywords.join(', '));
        const success = await bridge.updateImageDetails(image.id, { keywords: normalized });
        if (!success) {
            addNotification('Failed to persist keywords', 'error');
            return false;
        }

        setImage(prev => ({ ...prev, keywords: normalized }));
        setEditForm(prev => ({ ...prev, keywords: normalized }));
        return true;
    }, [addNotification, image.id]);

    const handleAcceptSuggestion = useCallback(async (keyword: string) => {
        const existing = parseKeywordText(editForm.keywords);
        const existingSet = new Set(existing.map(item => item.toLowerCase()));
        if (!existingSet.has(keyword.toLowerCase())) {
            existing.push(keyword);
        }

        const persisted = await persistKeywords(existing);
        if (!persisted) return;

        setSuggestionRows(prev => prev.filter(row => row.keyword !== keyword));
    }, [editForm.keywords, persistKeywords]);

    const handleRejectSuggestion = useCallback((keyword: string) => {
        setSuggestionRows(prev => prev.filter(row => row.keyword !== keyword));
        setSuppressedByImage(prev => {
            const current = new Set((prev[image.id] || []).map(tag => tag.toLowerCase()));
            current.add(keyword.toLowerCase());
            return {
                ...prev,
                [image.id]: Array.from(current),
            };
        });
    }, [image.id]);

    const handleApplyAllSuggestions = useCallback(async () => {
        const accepted = suggestionRows
            .filter(row => row.decision === 'pending' && row.confidence >= HIGH_CONFIDENCE_THRESHOLD)
            .map(row => row.keyword);

        if (!accepted.length) {
            addNotification('No high-confidence suggestions to apply', 'warning');
            return;
        }

        const existing = parseKeywordText(editForm.keywords);
        const mergedMap = new Map(existing.map(item => [item.toLowerCase(), item]));
        accepted.forEach(keyword => mergedMap.set(keyword.toLowerCase(), keyword));
        const merged = Array.from(mergedMap.values());
        const persisted = await persistKeywords(merged);
        if (!persisted) return;

        setSuggestionRows(prev => prev.filter(row => !accepted.includes(row.keyword)));
    }, [addNotification, editForm.keywords, persistKeywords, suggestionRows]);

    useEffect(() => {
        if (!SIMILAR_SEARCH_ENABLED) {
            return;
        }
        if (initialSimilarSearchImageId != null) {
            setSimilarSearchImageId(initialSimilarSearchImageId);
            setIsSimilarDrawerOpen(true);
        }
    }, [initialSimilarSearchImageId]);

    useEffect(() => {
        editKeywordsRef.current = editForm.keywords;
    }, [editForm.keywords]);

    useEffect(() => {
        if (isEditing) {
            setEditForm({
                title: image.title || '',
                description: image.description || '',
                rating: image.rating || 0,
                label: image.label || 'None',
                keywords: image.keywords || ''
            });
        }
    }, [isEditing, image]);

    useEffect(() => {
        if (!isEditing || readOnlyFilesystemMode) {
            setSuggestionRows([]);
            setSuggestionsLoadError(null);
            return;
        }
        void loadSuggestedKeywords();
    }, [isEditing, readOnlyFilesystemMode, image.id, loadSuggestedKeywords]);

    const handleSave = async () => {
        try {
            const normalizedKeywords = normalizeKeywords(editForm.keywords);
            const updates = {
                title: editForm.title,
                description: editForm.description,
                rating: editForm.rating,
                label: editForm.label,
                keywords: normalizedKeywords
            };
            const success = await bridge.updateImageDetails(image.id, updates);
            if (success) {
                setImage({ ...image, ...updates });
                setEditForm(prev => ({ ...prev, keywords: normalizedKeywords }));
                setIsEditing(false);
            } else {
                addNotification('Failed to save changes', 'error');
            }
        } catch (e) {
            console.error('Failed to update image:', e);
            addNotification('Error updating image', 'error');
        }
    };

    const handleDeleteClick = () => {
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        setIsDeleteDialogOpen(false);

        try {
            const success = await bridge.deleteImage(image.id);
            if (success) {
                if (onDelete) {
                    onDelete(image.id);
                } else {
                    onClose();
                }
            } else {
                addNotification('Failed to delete image', 'error');
            }
        } catch (e) {
            console.error('Failed to delete image:', e);
            addNotification('Error deleting image', 'error');
        }
    };

    const handlePropagateTags = useCallback(async () => {
        const normalizedKeywords = normalizeKeywords(editForm.keywords);
        const currentKeywords = normalizeKeywords(image.keywords || '');
        const folderPath = getFolderPathFromFilePath(image.win_path || image.file_path);

        if (!folderPath) {
            addNotification('Cannot determine the current folder for tag propagation', 'warning');
            return;
        }

        if (!normalizedKeywords) {
            addNotification('Add at least one keyword before propagating tags', 'warning');
            return;
        }

        if (normalizedKeywords !== currentKeywords) {
            const saveSucceeded = await bridge.updateImageDetails(image.id, { keywords: normalizedKeywords });
            if (!saveSucceeded) {
                addNotification('Failed to save keywords before propagation', 'error');
                return;
            }

            setImage(prev => ({ ...prev, keywords: normalizedKeywords }));
            setEditForm(prev => ({ ...prev, keywords: normalizedKeywords }));
        }

        try {
            const result = await propagate({
                folder_path: folderPath,
                dry_run: false,
            });

            if (result?.success) {
                const propagated = Number(result.data?.propagated ?? 0);
                addNotification(`Propagated tags to ${propagated} images`, 'success');
                return;
            }

            addNotification(result?.message || 'Tag propagation did not complete', 'warning');
        } catch (e) {
            addNotification('Propagation failed', 'error');
            console.error('Propagation failed:', e);
        }
    }, [addNotification, editForm.keywords, image.file_path, image.id, image.keywords, image.win_path, propagate]);

    const [previewSrc, setPreviewSrc] = React.useState<string>('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Load image effect
    useEffect(() => {
        let active = true;
        let objectUrl: string | null = null;

        const loadImage = async () => {
            setLoading(true);
            setError(null);
            setPreviewSrc('');

            try {
                // Use win_path if available (from detailed fetch), else fallback to file_path
                const pathSchema = image.win_path || image.file_path;

                // Case 1: Web safe image - use direct path
                if (isWebSafe(image.file_name)) {
                    if (active) setPreviewSrc(toMediaUrl(pathSchema));
                    return;
                }

                // Case 2: RAW image - try to extract/decode
                if (isRaw(image.file_name)) {
                    try {
                        // Use new extractWithFallback method which:
                        // 1. Tries server-side exiftool extraction (best for Z9/Z6/Z8)
                        // 2. Falls back to client-side TIFF SubIFD parsing
                        // 3. Falls back to JPEG marker scanning
                        const { nefViewer } = await import('../../utils/nefViewer');
                        const blob = await nefViewer.extractWithFallback(pathSchema);

                        if (blob && active) {
                            objectUrl = URL.createObjectURL(blob);
                            setPreviewSrc(objectUrl);
                            return;
                        }
                    } catch (err) {
                        console.error('Failed to process RAW file:', err);
                        // Fallthrough to thumbnail
                    }
                }

                // Case 3: Fallback to thumbnail (server generated) or show error
                if (image.thumbnail_path && active) {
                    setPreviewSrc(toMediaUrl(image.thumbnail_path));
                } else if (active) {
                    setError('No preview available');
                }

            } catch (err) {
                console.error('Image loading error:', err);
                if (active) setError('Failed to load image');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadImage();

        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [image]);

    const src = previewSrc;

    useEffect(() => {
        let active = true;

        const buildExportPayload = async () => {
            if (!src) {
                return { error: 'No preview loaded yet.' };
            }

            try {
                const response = await fetch(src);
                const blob = await response.blob();
                const mimeType = blob.type || 'image/jpeg';
                const outMime =
                    mimeType.includes('jpeg') || mimeType.includes('jpg')
                        ? 'image/jpeg'
                        : mimeType.includes('png')
                            ? 'image/png'
                            : mimeType.includes('webp')
                                ? 'image/webp'
                                : 'image/jpeg';

                const bakeResult = await bakeExifOrientationToBlob(blob, outMime);
                const exportBlob = bakeResult?.blob ?? blob;
                const pixelNormalizationApplied = bakeResult?.didNormalize ?? false;
                const exportMime = bakeResult ? outMime : mimeType;

                const buffer = await exportBlob.arrayBuffer();
                const bytes = Array.from(new Uint8Array(buffer));

                const baseName = image.file_name.replace(/\.[^/.]+$/, '');
                const suggestedFileName =
                    exportMime.includes('jpeg') || exportMime.includes('jpg')
                        ? `${baseName}.jpg`
                        : exportMime.includes('png')
                            ? `${baseName}.png`
                            : exportMime.includes('webp')
                                ? `${baseName}.webp`
                                : `${baseName}.jpg`;

                console.debug('[ImageViewer] export payload', {
                    pixelNormalizationApplied,
                    suggestedFileName,
                });

                return {
                    bytes,
                    mimeType: exportMime,
                    suggestedFileName,
                    id: image.id,
                    sourcePath: image.win_path || image.file_path,
                    imageUuid: image.image_uuid || null,
                    pixelNormalizationApplied,
                    previewOrientation: bakeResult?.sourceOrientation ?? undefined
                };
            } catch (e) {
                console.error('Failed to read displayed preview bytes:', e);
                return { error: 'Could not read displayed preview bytes.' };
            }
        };

        const syncExportContext = async () => {
            if (!src) {
                await bridge.setCurrentExportImageContext(null);
                return;
            }

            const payload = await buildExportPayload();
            if (!active) return;

            if ('error' in payload) {
                await bridge.setCurrentExportImageContext(null);
                return;
            }

            await bridge.setCurrentExportImageContext({
                imageBytes: payload.bytes,
                mimeType: payload.mimeType,
                fileName: payload.suggestedFileName,
                id: payload.id as number,
                sourcePath: payload.sourcePath as string,
                imageUuid: payload.imageUuid as string | null,
                pixelNormalizationApplied: payload.pixelNormalizationApplied,
                previewOrientation: payload.previewOrientation
            });
        };

        syncExportContext();

        return () => {
            active = false;
            void bridge.setCurrentExportImageContext(null);
        };
    }, [src, image.file_name, image.file_path, image.id, image.image_uuid, image.win_path]);

    // Format date
    const dateStr = image.created_at ? new Date(image.created_at).toLocaleString() : 'Unknown';

    // Label color
    const labelColor = image.label === 'Red' ? '#e53935' :
        image.label === 'Yellow' ? '#fdd835' :
            image.label === 'Green' ? '#43a047' :
                image.label === 'Blue' ? '#1e88e5' :
                    image.label === 'Purple' ? '#8e24aa' : 'None';
    const normalizedEditKeywords = normalizeKeywords(editForm.keywords);
    const keywordSource = effectiveEditing ? editForm.keywords : image.keywords || '';
    const keywordItems = keywordSource
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
    const propagationFolderPath = getFolderPathFromFilePath(image.win_path || image.file_path);

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'row'
        }}>
            {/* Main Image Area */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: 20,
                        left: 20,
                        background: 'rgba(0,0,0,0.5)',
                        border: 'none',
                        borderRadius: '50%',
                        width: 40,
                        height: 40,
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 10
                    }}
                >
                    <X size={24} />
                </button>

                {/* Image Position Indicator */}
                {allImages && allImages.length > 1 && (
                    <div style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
                        background: 'rgba(0,0,0,0.7)',
                        padding: '8px 16px',
                        borderRadius: 4,
                        color: '#ccc',
                        fontSize: '0.9em',
                        zIndex: 10
                    }}>
                        {currentIndex + 1} / {allImages.length}
                    </div>
                )}

                {loading ? (
                    <div style={{ color: '#aaa' }}>Loading preview...</div>
                ) : src ? (
                    <img
                        src={src}
                        alt={image.file_name}
                        style={{ maxWidth: '95%', maxHeight: '95vh', width: 'auto', height: 'auto', objectFit: 'contain', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}
                    />
                ) : (
                    <div style={{ color: '#666' }}>{error || 'Image not found'}</div>
                )}
            </div>

            {/* Metadata Sidebar */}
            <div style={{
                width: 350,
                backgroundColor: '#1e1e1e',
                borderLeft: '1px solid #333',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                overflowY: 'auto'
            }}>
                <div>
                    <h2 style={{ fontSize: '1.2em', margin: '0 0 10px 0', wordBreak: 'break-all' }}>{image.file_name}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#aaa', fontSize: '0.9em' }}>
                        <FileText size={14} />
                        <span style={{ wordBreak: 'break-all' }}>{image.win_path || image.file_path}</span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: '0.8em', color: '#666' }}>
                        {dateStr}
                    </div>

                    {image.file_exists === false && (
                        <div style={{
                            marginTop: 10,
                            padding: 8,
                            backgroundColor: 'rgba(255, 152, 0, 0.15)',
                            border: '1px solid #f57c00',
                            borderRadius: 4,
                            color: '#ffb74d',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: '0.9em'
                        }}>
                            <AlertTriangle size={16} color="#ffa726" />
                            <span>Source file not found</span>
                        </div>
                    )}
                </div>

                {/* Edit & Core Controls */}
                {!readOnlyFilesystemMode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {!isEditing ? (
                                <>
                                    <button onClick={() => setIsEditing(true)} style={{ flex: 1, padding: 8, background: '#007acc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                        <Edit2 size={16} /> Edit
                                    </button>
                                    <button onClick={handleDeleteClick} style={{ flex: 1, padding: 8, background: '#d32f2f', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                        <Trash2 size={16} /> Delete
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={handleSave} style={{ flex: 1, padding: 8, background: '#43a047', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                        <Save size={16} /> Save
                                    </button>
                                    <button onClick={() => setIsEditing(false)} style={{ flex: 1, padding: 8, background: '#555', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                        <RotateCcw size={16} /> Cancel
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {!effectiveEditing ? (
                    <>
                        {image.title && (
                            <div>
                                <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 4 }}>TITLE</div>
                                <div style={{ fontSize: '1em' }}>{image.title}</div>
                            </div>
                        )}

                        {image.description && (
                            <div>
                                <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 4 }}>DESCRIPTION</div>
                                <div style={{ fontSize: '0.9em', color: '#ccc', whiteSpace: 'pre-wrap' }}>{image.description}</div>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                            <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 4 }}>TITLE</div>
                            <input
                                type="text"
                                value={editForm.title}
                                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                style={{ width: '100%', padding: 5, background: '#333', color: 'white', border: '1px solid #555', borderRadius: 4 }}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 4 }}>DESCRIPTION</div>
                            <textarea
                                value={editForm.description}
                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                rows={3}
                                style={{ width: '100%', padding: 5, background: '#333', color: 'white', border: '1px solid #555', borderRadius: 4, resize: 'vertical' }}
                            />
                        </div>
                    </div>
                )}

                {/* Keywords / Tags */}
                <div style={{ marginTop: 5, marginBottom: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.8em', color: '#888' }}>KEYWORDS</div>
                        {effectiveEditing && (
                            <button
                                onClick={() => {
                                    void handlePropagateTags();
                                }}
                                disabled={propagateLoading || !propagationFolderPath || !normalizedEditKeywords}
                                title={
                                    !propagationFolderPath
                                        ? 'Folder path unavailable for propagation'
                                        : !normalizedEditKeywords
                                            ? 'Add keywords before propagating'
                                            : 'Propagate tags in this folder'
                                }
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    background: '#333',
                                    border: '1px solid #555',
                                    borderRadius: 4,
                                    color: '#ccc',
                                    fontSize: '0.75em',
                                    cursor: propagateLoading || !propagationFolderPath || !normalizedEditKeywords ? 'default' : 'pointer',
                                    opacity: propagateLoading || !propagationFolderPath || !normalizedEditKeywords ? 0.6 : 1
                                }}
                            >
                                {propagateLoading ? <Loader2 size={12} className="animate-spin" /> : <Tag size={12} />}
                                Propagate Tags
                            </button>
                        )}
                    </div>
                    {effectiveEditing ? (
                        <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {keywordItems.map((tag, i) => (
                                    <div
                                        key={`${tag}-${i}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#333', padding: '2px 8px', borderRadius: 4, fontSize: '0.8em', color: '#ccc' }}
                                    >
                                        <span>{tag}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const next = keywordItems.filter((t, idx) => !(t === tag && idx === i));
                                                setEditForm({ ...editForm, keywords: next.join(', ') });
                                            }}
                                            style={{ border: 'none', background: 'transparent', color: '#888', cursor: 'pointer', padding: 0, fontSize: '0.9em', lineHeight: 1 }}
                                            aria-label={`Remove keyword ${tag}`}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <input
                                type="text"
                                placeholder="Comma separated keywords..."
                                value={editForm.keywords}
                                onChange={e => setEditForm({ ...editForm, keywords: e.target.value })}
                                style={{ width: '100%', padding: 5, background: '#333', color: 'white', border: '1px solid #555', borderRadius: 4 }}
                            />
                        </>
                    ) : (
                        keywordItems.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {keywordItems.map((tag, i) => (
                                    <div
                                        key={`${tag}-${i}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#333', padding: '2px 8px', borderRadius: 4, fontSize: '0.8em', color: '#ccc' }}
                                    >
                                        <span>{tag}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.8em', color: '#666' }}>No keywords</div>
                        )
                    )}
                </div>
                {effectiveEditing && (
                    <div style={{ marginTop: 0, marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: '0.8em', color: '#888' }}>AI SUGGESTED KEYWORDS</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                    type="button"
                                    onClick={() => { void loadSuggestedKeywords(); }}
                                    disabled={suggestionsLoading}
                                    style={{
                                        padding: '2px 8px',
                                        background: '#262626',
                                        border: '1px solid #4a4a4a',
                                        borderRadius: 4,
                                        color: '#ccc',
                                        fontSize: '0.75em',
                                        cursor: suggestionsLoading ? 'default' : 'pointer',
                                        opacity: suggestionsLoading ? 0.7 : 1
                                    }}
                                >
                                    {suggestionsLoading ? 'Loading…' : 'Refresh'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { void handleApplyAllSuggestions(); }}
                                    disabled={!suggestionRows.some(row => row.decision === 'pending' && row.confidence >= HIGH_CONFIDENCE_THRESHOLD)}
                                    style={{
                                        padding: '2px 8px',
                                        background: '#234a2e',
                                        border: '1px solid #3f7a51',
                                        borderRadius: 4,
                                        color: '#d7f3df',
                                        fontSize: '0.75em',
                                        cursor: 'pointer',
                                        opacity: !suggestionRows.some(row => row.decision === 'pending' && row.confidence >= HIGH_CONFIDENCE_THRESHOLD) ? 0.5 : 1
                                    }}
                                >
                                    Apply All
                                </button>
                            </div>
                        </div>
                        {suggestionsLoadError && (
                            <div style={{ fontSize: '0.75em', color: '#ef9a9a', marginBottom: 6 }}>
                                {suggestionsLoadError}
                            </div>
                        )}
                        {suggestionRows.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {suggestionRows.map(row => (
                                    <div
                                        key={row.keyword}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 8,
                                            padding: '5px 8px',
                                            borderRadius: 6,
                                            border: '1px dashed #666',
                                            background: 'rgba(120, 120, 120, 0.12)',
                                            color: '#cfd8dc',
                                            fontSize: '0.8em',
                                            fontStyle: 'italic'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>{row.keyword}</span>
                                            <span style={{ color: '#90a4ae', fontSize: '0.75em' }}>{confidenceToPercent(row.confidence)}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <button
                                                type="button"
                                                onClick={() => { void handleAcceptSuggestion(row.keyword); }}
                                                style={{ border: '1px solid #357a38', background: '#1f4023', color: '#c8e6c9', borderRadius: 4, cursor: 'pointer', fontSize: '0.75em' }}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { handleRejectSuggestion(row.keyword); }}
                                                style={{ border: '1px solid #8b2d2d', background: '#4d1c1c', color: '#ffcdd2', borderRadius: 4, cursor: 'pointer', fontSize: '0.75em' }}
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.8em', color: '#666' }}>
                                {suggestionsLoading ? 'Loading suggestions…' : 'No pending suggestions'}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #333', borderBottom: '1px solid #333' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 4 }}>RATING</div>
                        {!effectiveEditing ? (
                            <div style={{ color: '#ffd700', fontSize: '1.1em', display: 'flex', alignItems: 'center' }}>
                                <Star fill="#ffd700" size={16} style={{ marginRight: 4 }} />
                                {image.rating}
                            </div>
                        ) : (
                            <select
                                value={editForm.rating}
                                onChange={e => setEditForm({ ...editForm, rating: Number(e.target.value) })}
                                style={{ width: '100%', padding: 5, background: '#333', color: 'white', border: '1px solid #555', borderRadius: 4 }}
                            >
                                <option value={0}>0 - Unrated</option>
                                <option value={1}>1 - Poor</option>
                                <option value={2}>2 - Fair</option>
                                <option value={3}>3 - Good</option>
                                <option value={4}>4 - Very Good</option>
                                <option value={5}>5 - Excellent</option>
                            </select>
                        )}
                    </div>

                    <div style={{ width: 1, height: 30, background: '#333' }}></div>

                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 4 }}>SCORE</div>
                        <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
                            {image.score_general ? `${Math.round(image.score_general * 100)}%` : '0%'}
                        </div>
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 8 }}>LABEL</div>
                    {!effectiveEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                                width: 16, height: 16, borderRadius: '50%',
                                backgroundColor: labelColor,
                                border: labelColor === 'None' ? '1px solid #555' : 'none'
                            }} />
                            <span>{image.label || 'None'}</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 5 }}>
                            {['None', 'Red', 'Yellow', 'Green', 'Blue', 'Purple'].map(color => {
                                const bg = color === 'Red' ? '#e53935' :
                                    color === 'Yellow' ? '#fdd835' :
                                        color === 'Green' ? '#43a047' :
                                            color === 'Blue' ? '#1e88e5' :
                                                color === 'Purple' ? '#8e24aa' : '#333';
                                return (
                                    <button
                                        key={color}
                                        onClick={() => setEditForm({ ...editForm, label: color })}
                                        style={{
                                            width: 24, height: 24, borderRadius: '50%',
                                            background: bg,
                                            border: editForm.label === color ? '2px solid white' : '1px solid #555',
                                            cursor: 'pointer'
                                        }}
                                        title={color}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {!detailsLoaded && (
                    <div style={{ 
                        borderTop: '1px solid #333', 
                        paddingTop: 15, 
                        color: '#888', 
                        fontSize: '0.85em', 
                        fontStyle: 'italic',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10
                    }}>
                        <Loader2 size={16} className="animate-spin" />
                        Loading detailed information...
                    </div>
                )}

                {detailsLoaded && detailsError && (
                    <div style={{ 
                        borderTop: '1px solid #333', 
                        paddingTop: 15, 
                        color: '#ef9a9a', 
                        fontSize: '0.85em', 
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        <AlertTriangle size={16} />
                        <span>{detailsError}</span>
                    </div>
                )}

                {detailsLoaded && (
                    <>
                        {!readOnlyFilesystemMode && (
                            <>
                                {/* Scores Section */}
                                <div style={{ borderTop: '1px solid #333', paddingTop: 15 }}>
                                    <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: 15, color: '#ddd' }}>Model Scores</div>

                                    <ScoreBar label="General" value={image.score_general} color="#ff5722" />
                                    <ScoreBar label="Technical" value={image.score_technical ?? 0} />
                                    <ScoreBar label="Aesthetic" value={image.score_aesthetic ?? 0} />

                                    {(image.score_spaq ?? 0) > 0 && <ScoreBar label="SPAQ" value={image.score_spaq ?? 0} />}
                                    {(image.score_ava ?? 0) > 0 && <ScoreBar label="AVA" value={image.score_ava ?? 0} />}
                                    {(image.score_liqe ?? 0) > 0 && <ScoreBar label="LIQE" value={image.score_liqe ?? 0} />}
                                </div>

                                {/* Database IDs */}
                                <div style={{ borderTop: '1px solid #333', paddingTop: 15 }}>
                                    <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: 10, color: '#ddd' }}>Database Info</div>
                            <div style={{ fontSize: '0.85em', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{ color: '#888' }}>Image UUID:</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.75em', wordBreak: 'break-all', color: '#999' }}>
                                        {image.image_uuid || 'None'}
                                    </span>
                                </div>
                                {image.burst_uuid && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span style={{ color: '#888' }}>Burst UUID:</span>
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.75em', wordBreak: 'break-all', color: '#999' }}>
                                            {image.burst_uuid}
                                        </span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#888' }}>Image ID:</span>
                                    {onOpenImageById ? (
                                        <button
                                            type="button"
                                            title="Focus this image in the gallery list"
                                            onClick={() => void onOpenImageById(image.id)}
                                            style={{
                                                fontFamily: 'monospace',
                                                background: 'none',
                                                border: 'none',
                                                color: '#7eb8ff',
                                                cursor: 'pointer',
                                                padding: 0,
                                                textDecoration: 'underline',
                                            }}
                                        >
                                            {image.id}
                                        </button>
                                    ) : (
                                        <span>{image.id}</span>
                                    )}
                                </div>
                                {image.folder_id && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>Folder ID:</span>
                                        <span>{image.folder_id}</span>
                                    </div>
                                )}
                                {image.stack_id && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>Stack ID:</span>
                                        <span>{image.stack_id}</span>
                                    </div>
                                )}
                                {image.job_id && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>Job ID:</span>
                                        <span>{image.job_id}</span>
                                    </div>
                                )}
                            </div>
                                </div>
                            </>
                        )}

                        {/* EXIF Info */}
                        <div style={{ borderTop: '1px solid #333', paddingTop: 15 }}>
                            <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: 10, color: '#ddd' }}>Photography Stats</div>
                            {exifLoading ? (
                                <div style={{ fontSize: '0.8em', color: '#666', fontStyle: 'italic' }}>Loading camera data...</div>
                            ) : exifData ? (
                                <div style={{ fontSize: '0.85em', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>ISO:</span>
                                        <span>{exifData.ISO || 'Unknown'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>Shutter:</span>
                                        <span>{exifData.ShutterSpeed ? `${exifData.ShutterSpeed}s` : 'Unknown'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>Aperture:</span>
                                        <span>{exifData.Aperture ? `f/${exifData.Aperture}` : 'Unknown'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>Focal Length:</span>
                                        <span>{exifData.FocalLength || 'Unknown'}</span>
                                    </div>
                                    {exifData.Model && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                                            <span style={{ color: '#888' }}>Camera:</span>
                                            <span style={{ color: '#ccc' }}>{exifData.Model}</span>
                                        </div>
                                    )}
                                    {exifData.LensModel && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <span style={{ color: '#888' }}>Lens:</span>
                                            <span style={{ color: '#ccc', fontSize: '0.9em' }}>{exifData.LensModel}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.8em', color: '#666' }}>No EXIF data found</div>
                            )}
                        </div>

                        {!readOnlyFilesystemMode && (
                            <div style={{ borderTop: '1px solid #333', paddingTop: 15 }}>
                                <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: 10, color: '#ddd' }}>Phases</div>
                                <div style={{ fontSize: '0.85em', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>{STAGE_DISPLAY.metadata.name}:</span>
                                        <span style={{ color: exifData ? '#4caf50' : '#ffa726' }}>
                                            {exifData ? 'Extracted' : 'Pending'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>{STAGE_DISPLAY.scoring.name}:</span>
                                        <span style={{ color: image.score_general !== null && image.score_general !== undefined ? '#4caf50' : '#ffa726' }}>
                                            {image.score_general !== null && image.score_general !== undefined ? 'Completed' : 'Pending'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>{STAGE_DISPLAY.culling.name}:</span>
                                        <span style={{ color: image.rating > 0 || (image.label && image.label !== 'None') ? '#4caf50' : '#ffa726' }}>
                                            {image.rating > 0 || (image.label && image.label !== 'None') ? 'Completed' : 'Pending'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#888' }}>{STAGE_DISPLAY.keywords.name}:</span>
                                        <span style={{ color: image.keywords ? '#4caf50' : '#ffa726' }}>
                                            {image.keywords ? 'Completed' : 'Pending'}
                                        </span>
                                    </div>
                                    {image.file_path && (
                                        <div style={{ marginTop: 12 }}>
                                            <p style={{ margin: '0 0 8px', fontSize: '0.8em', color: '#888', lineHeight: 1.4 }}>
                                                Re-read EXIF/XMP and refresh DB fields for this file on the Python backend (no full AI re-score).
                                            </p>
                                            <button
                                                type="button"
                                                disabled={fixMetadataBusy}
                                                onClick={() => { void handleFixImageMetadata(); }}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    background: '#2a4a2a',
                                                    color: '#e8f5e9',
                                                    border: '1px solid #3d6b3d',
                                                    borderRadius: 4,
                                                    cursor: fixMetadataBusy ? 'wait' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 8,
                                                    fontWeight: 500,
                                                    opacity: fixMetadataBusy ? 0.7 : 1,
                                                }}
                                            >
                                                {fixMetadataBusy ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <Wrench size={16} />
                                                )}
                                                Fix metadata on server
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Bottom Action Area */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #333', paddingTop: 20 }}>
                    {!effectiveEditing && !readOnlyFilesystemMode && (
                        <>
                            {image.folder_id && onOpenFolder && (
                                <button
                                    onClick={() => onOpenFolder(image.folder_id!)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: '#007acc',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        fontWeight: 500
                                    }}
                                >
                                    <FolderOpen size={16} /> Open Folder
                                </button>
                            )}

                            <button
                                type="button"
                                disabled
                                onClick={() => {
                                    if (!SIMILAR_SEARCH_ENABLED) {
                                        return;
                                    }
                                    setSimilarSearchImageId(image.id);
                                    setIsSimilarDrawerOpen(true);
                                }}
                                title="Similar image search is currently disabled."
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#2a2a2a',
                                    color: '#9e9e9e',
                                    border: '1px solid #444',
                                    borderRadius: 4,
                                    cursor: 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    fontWeight: 500,
                                    opacity: 0.8
                                }}
                            >
                                <Search size={16} /> Find Similar Images (temporarily disabled)
                            </button>

                        </>
                    )}
                </div>
            </div>

            {SIMILAR_SEARCH_ENABLED && !readOnlyFilesystemMode && (
                <SimilarSearchDrawer
                    open={isSimilarDrawerOpen}
                    onClose={() => setIsSimilarDrawerOpen(false)}
                    queryImageId={similarSearchImageId ?? image.id}
                    currentFolderId={image.folder_id}
                    onSelectImage={async (id) => {
                        const idx = allImages.findIndex(img => img.id === id);
                        if (idx >= 0 && onNavigate) {
                            onNavigate(idx);
                            setIsSimilarDrawerOpen(false);
                            return;
                        }

                        if (onOpenImageById) {
                            const opened = await onOpenImageById(id);
                            if (opened) {
                                setIsSimilarDrawerOpen(false);
                                return;
                            }
                        }

                        const details = await bridge.getImageDetails(id);
                        if (details) {
                            setImage(details);
                            setDetailsLoaded(true);
                            setIsSimilarDrawerOpen(false);
                        }
                    }}
                    onJumpToImageFolder={(id) => { void onOpenImageById?.(id); }}
                />
            )}

            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                title="Delete Image"
                message="Are you sure you want to delete this source image (NEF file) AND the database record? This cannot be undone."
                confirmLabel="Delete"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={handleDeleteConfirm}
                onCancel={() => setIsDeleteDialogOpen(false)}
            />
        </div>
    );
};
