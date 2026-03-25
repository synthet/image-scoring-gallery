import { useState } from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import type { Folder } from '../Tree/treeUtils';
import { bridge } from '../../bridge';

interface DuplicateFinderProps {
    currentFolder: Folder | null | undefined;
}

interface DuplicatePair {
    image_id_a: number;
    image_id_b: number;
    similarity: number;
    file_path_a: string;
    file_path_b: string;
}

interface ImageInfo {
    id: number;
    file_path: string;
    file_name: string;
    score_general?: number;
    rating?: number;
}

interface DetailedPair extends DuplicatePair {
    imgA: ImageInfo | null;
    imgB: ImageInfo | null;
}

export function DuplicateFinder({ currentFolder }: DuplicateFinderProps) {
    const [threshold, setThreshold] = useState<number>(0.98);
    const [isScanning, setIsScanning] = useState(false);
    const [duplicatePairs, setDuplicatePairs] = useState<DuplicatePair[]>([]);
    const [detailedPairs, setDetailedPairs] = useState<DetailedPair[]>([]);

    const addNotification = useNotificationStore(state => state.addNotification);


    const handleScan = async () => {
        setIsScanning(true);
        setDuplicatePairs([]);
        setDetailedPairs([]);
        try {
            const response = await bridge.findNearDuplicates({
                threshold,
                folder_path: currentFolder?.path || undefined,
                limit: 1000
            });

            if (response?.success && response.data?.duplicates) {
                setDuplicatePairs(response.data.duplicates);
                addNotification(`Found ${response.data.duplicates.length} duplicate pairs`, 'success');

                // Fetch details for the first 20 pairs initially to avoid overwhelming DB
                const pairsToFetch = response.data.duplicates.slice(0, 20);
                await fetchDetailsForPairs(pairsToFetch);
            } else {
                addNotification(response?.message || 'Failed to find duplicates', 'error');
            }
        } catch (e: unknown) {
            addNotification(`Scan failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setIsScanning(false);
        }
    };

    const fetchDetailsForPairs = async (pairs: DuplicatePair[]) => {
        const detailed = await Promise.all(pairs.map(async (pair) => {
            const imgA = await bridge.getImageDetails(pair.image_id_a);
            const imgB = await bridge.getImageDetails(pair.image_id_b);
            return { ...pair, imgA, imgB };
        }));
        setDetailedPairs(prev => [...prev, ...detailed]);
    };

    const handleKeepBest = async (pair: DetailedPair, index: number) => {
        const { imgA, imgB } = pair;
        if (!imgA || !imgB) return;

        // Determine best based on score_general
        const scoreA = imgA.score_general || 0;
        const scoreB = imgB.score_general || 0;

        let worstId = null;
        if (scoreA >= scoreB) {
            worstId = imgB.id;
        } else {
            worstId = imgA.id;
        }

        try {
            await bridge.updateImageDetails(worstId, { rating: -1 });
            addNotification('Rejected the lower-rated image.', 'success');
            // Remove from detailedPairs
            setDetailedPairs(prev => prev.filter((_, i) => i !== index));
        } catch (err: unknown) {
            addNotification(`Failed to reject image: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e', color: '#fff' }}>
            <div style={{ padding: '20px', backgroundColor: '#2d2d2d', borderBottom: '1px solid #444', display: 'flex', gap: '20px', alignItems: 'flex-end' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '300px' }}>
                    <label style={{ fontSize: '13px', color: '#aaa' }}>Target Folder</label>
                    <div
                        style={{ padding: '8px', backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={currentFolder?.path || 'Whole Library'}
                    >
                        {currentFolder?.path || 'Whole Library'}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, maxWidth: '300px' }}>
                    <label style={{ fontSize: '13px', color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Similarity Threshold</span>
                        <span>{(threshold * 100).toFixed(1)}%</span>
                    </label>
                    <input
                        type="range"
                        min="0.80" max="1.0" step="0.01"
                        value={threshold}
                        onChange={e => setThreshold(parseFloat(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                </div>

                <button
                    onClick={handleScan}
                    disabled={isScanning}
                    style={{
                        padding: '8px 24px',
                        backgroundColor: isScanning ? '#555' : '#007acc',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isScanning ? 'not-allowed' : 'pointer',
                        height: '35px',
                        fontWeight: 'bold'
                    }}
                >
                    {isScanning ? 'Scanning...' : 'Scan Now'}
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {duplicatePairs.length > 0 && detailedPairs.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        Loading details for pairs...
                    </div>
                )}

                {detailedPairs.length === 0 && !isScanning && duplicatePairs.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        Select a folder and adjust the threshold to find near-triplicates.
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
                    {detailedPairs.map((pair, idx) => (
                        <div key={idx} style={{ backgroundColor: '#2d2d2d', borderRadius: '8px', overflow: 'hidden', border: '1px solid #444', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '10px 15px', backgroundColor: '#333', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong>Similarity: {(pair.similarity * 100).toFixed(1)}%</strong>
                                <button
                                    onClick={() => handleKeepBest(pair, idx)}
                                    style={{ backgroundColor: '#4caf50', border: 'none', borderRadius: '4px', color: '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    Keep Best Only
                                </button>
                            </div>
                            <div style={{ display: 'flex', flex: 1 }}>

                                {/* Image A */}
                                <div style={{ flex: 1, borderRight: '1px solid #444', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ height: '200px', backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {pair.imgA ? (
                                            <img src={`file://${pair.file_path_a}`} alt="Image A" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                        ) : 'Loading...'}
                                    </div>
                                    <div style={{ padding: '10px', fontSize: '12px', color: '#aaa', flex: 1 }}>
                                        <div style={{ wordBreak: 'break-all', marginBottom: '4px' }} title={pair.file_path_a}>
                                            {pair.file_path_a.split(/[\\/]/).pop()}
                                        </div>
                                        {pair.imgA && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                                                <span>Score: {pair.imgA.score_general ? pair.imgA.score_general.toFixed(2) : 'N/A'}</span>
                                                <span style={{ color: pair.imgA.rating === -1 ? '#f44336' : '#4caf50' }}>
                                                    Rating: {pair.imgA.rating ?? 0}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Image B */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ height: '200px', backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {pair.imgB ? (
                                            <img src={`file://${pair.file_path_b}`} alt="Image B" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                        ) : 'Loading...'}
                                    </div>
                                    <div style={{ padding: '10px', fontSize: '12px', color: '#aaa', flex: 1 }}>
                                        <div style={{ wordBreak: 'break-all', marginBottom: '4px' }} title={pair.file_path_b}>
                                            {pair.file_path_b.split(/[\\/]/).pop()}
                                        </div>
                                        {pair.imgB && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                                                <span>Score: {pair.imgB.score_general ? pair.imgB.score_general.toFixed(2) : 'N/A'}</span>
                                                <span style={{ color: pair.imgB.rating === -1 ? '#f44336' : '#4caf50' }}>
                                                    Rating: {pair.imgB.rating ?? 0}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
