import { useEffect, useMemo, useState } from 'react';
import { useSimilarImages } from '../../hooks/useDatabase';

interface SimilarSearchDrawerProps {
    open: boolean;
    onClose: () => void;
    queryImageId: number | null;
    currentFolderId?: number; // Optional: to restrict search to the current folder
    onSelectImage: (imageId: number) => void;
    onJumpToImageFolder: (imageId: number) => void;
}

interface FolderRow {
    id: number;
    path: string;
}

export function SimilarSearchDrawer({ open, onClose, queryImageId, currentFolderId, onSelectImage, onJumpToImageFolder }: SimilarSearchDrawerProps) {
    const [folderPathById, setFolderPathById] = useState<string | undefined>(undefined);
    const [minSimilarityInput, setMinSimilarityInput] = useState('0.80');

    const minSimilarity = useMemo(() => {
        const parsed = Number(minSimilarityInput);
        if (!Number.isFinite(parsed)) return 0.8;
        return Math.min(1, Math.max(0, parsed));
    }, [minSimilarityInput]);

    useEffect(() => {
        let isMounted = true;

        if (!open || !window.electron || !currentFolderId) {
            return;
        }

        window.electron.getFolders()
            .then((folders: FolderRow[]) => {
                if (!isMounted) return;
                const matchedFolder = folders.find((folder) => folder.id === currentFolderId);
                setFolderPathById(matchedFolder?.path);
            })
            .catch((err) => {
                if (!isMounted) return;
                console.error('[SimilarSearchDrawer] Failed to resolve folder path from folder id:', err);
                setFolderPathById(undefined);
            });

        return () => {
            isMounted = false;
        };
    }, [open, currentFolderId]);

    const resolvedFolderPath = currentFolderId ? folderPathById : undefined;

    // Only pass imageId when open to avoid unnecessary fetching in the background
    const activeImageId = open ? queryImageId : null;
    const { images, loading, error } = useSimilarImages(activeImageId, {
        limit: 20,
        folderId: currentFolderId,
        folderPath: resolvedFolderPath,
        minSimilarity,
    });

    if (!open) return null;

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 350,
            backgroundColor: '#1e1e1e',
            borderLeft: '1px solid #333',
            boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            transition: 'transform 0.3s ease-in-out',
            transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}>
            <div style={{
                padding: '15px 20px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#252526'
            }}>
                <h3 style={{ margin: 0, fontSize: '1.1em', fontWeight: 600 }}>Similar Images</h3>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#aaa',
                        cursor: 'pointer',
                        fontSize: '1.2em',
                        padding: 5
                    }}
                    title="Close"
                >
                    &times;
                </button>
            </div>

            <div style={{
                padding: '10px 15px',
                borderBottom: '1px solid #333',
                display: 'grid',
                gap: 8,
                backgroundColor: '#232323'
            }}>
                <label style={{ display: 'grid', gap: 4, color: '#bbb', fontSize: '0.8em' }}>
                    <span>Minimum Similarity</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={minSimilarity}
                            onChange={(e) => setMinSimilarityInput(e.currentTarget.value)}
                            style={{ flex: 1 }}
                            aria-label="Minimum Similarity Threshold Slider"
                        />
                        <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={minSimilarityInput}
                            onChange={(e) => setMinSimilarityInput(e.currentTarget.value)}
                            aria-label="Minimum Similarity Threshold Value"
                            style={{
                                width: 60,
                                backgroundColor: '#1a1a1a',
                                color: '#ddd',
                                border: '1px solid #444',
                                borderRadius: 4,
                                padding: '3px 6px'
                            }}
                        />
                    </div>
                </label>
                <div style={{
                    height: resolvedFolderPath ? '1.5em' : '0px',
                    overflow: 'hidden',
                    transition: 'height 0.2s ease-in-out, opacity 0.2s ease-in-out',
                    opacity: resolvedFolderPath ? 1 : 0
                }}>
                    {resolvedFolderPath && (
                        <div style={{ color: '#888', fontSize: '0.75em' }} title={resolvedFolderPath}>
                            Restricted to folder: {resolvedFolderPath}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 15 }}>
                {loading && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                        <div>Loading similar images...</div>
                    </div>
                )}

                {error && (
                    <div style={{ textAlign: 'center', padding: 20, color: '#f44336' }}>
                        <div style={{ marginBottom: 10 }}>Error finding similarities</div>
                        <div style={{ fontSize: '0.85em', color: '#ffaaaa' }}>{error}</div>
                    </div>
                )}

                {!loading && !error && images.length === 0 && queryImageId && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                        No similar images found (similarity {'>'} {(minSimilarity * 100).toFixed(0)}%).
                    </div>
                )}

                {!loading && !error && images.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                        {images.map(img => (
                            <div
                                key={img.image_id}
                                onClick={() => onSelectImage(img.image_id)}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    backgroundColor: '#2a2a2a',
                                    position: 'relative',
                                    paddingBottom: '100%', // Square aspect ratio
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                                    transition: 'transform 0.1s, box-shadow 0.1s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
                                }}
                            >
                                <img
                                    src={`media://${img.file_path}`}
                                    alt={`Similar match ${(img.similarity * 100).toFixed(1)}%`}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                    }}
                                />
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    padding: '4px 8px',
                                    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                                    fontSize: '0.75em',
                                    color: '#eee',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 8
                                }}>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onJumpToImageFolder(img.image_id);
                                        }}
                                        style={{
                                            border: '1px solid rgba(255,255,255,0.35)',
                                            background: 'rgba(0,0,0,0.45)',
                                            color: '#fff',
                                            borderRadius: 4,
                                            fontSize: '0.75em',
                                            padding: '2px 6px',
                                            cursor: 'pointer'
                                        }}
                                        title="Open this image in its folder"
                                    >
                                        Jump to Folder
                                    </button>
                                    <span>{(img.similarity * 100).toFixed(1)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
