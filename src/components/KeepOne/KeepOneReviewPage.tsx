import React, { useMemo, useState } from 'react';
import { bridge } from '../../bridge';
import { toMediaUrl } from '../../utils/mediaUrl';
import type {
    KeepOneCluster,
    KeepOneFrame,
    KeepOneRemoval,
    KeepOneReviewResult,
} from '../../../electron/keepOneReview';
import styles from './KeepOneReviewPage.module.css';

const BASIS_LABELS: Record<string, string> = {
    head_sharpness: 'Head sharpness',
    refcull_focus: 'Focus score',
    tie: 'Tie',
};

const SCORE_ROWS: Array<[keyof KeepOneFrame['scores'], string]> = [
    ['focus', 'Focus'],
    ['eye', 'Eye'],
    ['noise', 'Noise'],
    ['exposure', 'Exposure'],
];

interface Props {
    /** Opens the normal viewer for a catalog image. */
    onOpenImage: (imageId: number) => void;
}

function basename(path: string | null): string {
    if (!path) return '';
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
}

function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    return `${bytes} B`;
}

function FrameCard({ frame, role, onOpenImage }: {
    frame: KeepOneFrame | KeepOneRemoval;
    role: 'keeper' | 'removed';
    onOpenImage: (imageId: number) => void;
}) {
    const removal = role === 'removed' ? (frame as KeepOneRemoval) : null;
    const inCatalog = frame.live !== null;
    const src = toMediaUrl(frame.thumbnailPath || frame.filePath);
    return (
        <button
            type="button"
            className={`${styles.frame} ${role === 'keeper' ? styles.keeper : styles.removed}`}
            disabled={!inCatalog}
            onClick={() => onOpenImage(frame.imageId)}
            title={inCatalog ? 'Open in the viewer' : 'This image is no longer in the catalog'}
            data-testid={`keepone-frame-${frame.imageId}`}
        >
            {src ? <img className={styles.thumb} src={src} alt={frame.file} loading="lazy" /> : <div className={styles.thumb} />}
            <div className={styles.frameBody}>
                <div className={styles.frameName}>
                    <strong>{frame.file}</strong>
                    <span className={styles.mono}>{frame.iso ? `ISO ${frame.iso}` : ''}</span>
                </div>
                <div className={styles.tags}>
                    {role === 'keeper'
                        ? <span className={`${styles.tag} ${styles.tagKeep}`}>Keeper</span>
                        : <span className={`${styles.tag} ${styles.tagCull}`}>Proposed soft-cull</span>}
                    {removal?.basis && <span className={styles.tag}>{BASIS_LABELS[removal.basis] ?? removal.basis}</span>}
                    {removal?.jev && (
                        <span className={`${styles.tag} ${styles.tagInfo}`}>
                            Jev tie{removal.jev.confidence !== null ? ` ${removal.jev.confidence.toFixed(2)}` : ''}
                        </span>
                    )}
                    {!inCatalog && <span className={`${styles.tag} ${styles.tagWarn}`}>Not in catalog</span>}
                    {frame.changedSinceFreeze && <span className={`${styles.tag} ${styles.tagWarn}`}>Changed since run</span>}
                </div>
                <div className={styles.scores}>
                    {SCORE_ROWS.map(([key, label]) => {
                        const value = frame.scores[key];
                        return (
                            <React.Fragment key={key}>
                                <span>{label}</span>
                                <span className={styles.meter}>
                                    <i className={styles.meterFill} style={{ width: `${Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100)}%` }} />
                                </span>
                                <span className={styles.mono}>{value === null ? '–' : value.toFixed(2)}</span>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </button>
    );
}

export const KeepOneReviewPage: React.FC<Props> = ({ onOpenImage }) => {
    const [result, setResult] = useState<KeepOneReviewResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [shootFilter, setShootFilter] = useState('all');
    const [basisFilter, setBasisFilter] = useState('all');
    const [changedOnly, setChangedOnly] = useState(false);

    const openExport = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const next = await bridge.loadKeepOneReview();
            if (next.status === 'fallback') {
                if (next.reason !== 'cancelled') setMessage(`Could not open the export: ${next.detail}`);
                return;
            }
            setResult(next);
            setShootFilter('all');
            setBasisFilter('all');
            setChangedOnly(false);
        } catch (e) {
            setMessage(`Could not open the export: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setLoading(false);
        }
    };

    const ok = result?.status === 'ok' ? result : null;
    const bases = useMemo(() => {
        const set = new Set<string>();
        ok?.shoots.forEach((s) => s.clusters.forEach((c) => c.removed.forEach((r) => r.basis && set.add(r.basis))));
        return [...set].sort();
    }, [ok]);

    const clusters: KeepOneCluster[] = useMemo(() => {
        if (!ok) return [];
        return ok.shoots
            .filter((s) => shootFilter === 'all' || s.shoot === shootFilter)
            .flatMap((s) => s.clusters)
            .filter((c) => basisFilter === 'all' || c.removed.some((r) => r.basis === basisFilter))
            .filter((c) => !changedOnly || c.keeper.changedSinceFreeze || c.removed.some((r) => r.changedSinceFreeze));
    }, [ok, shootFilter, basisFilter, changedOnly]);

    const folderOf = useMemo(() => new Map(ok?.shoots.map((s) => [s.shoot, s.folder]) ?? []), [ok]);

    return (
        <div className={styles.page} data-testid="keepone-review-page">
            <div className={styles.toolbar}>
                <button type="button" className={styles.button} onClick={() => { void openExport(); }} disabled={loading}>
                    {loading ? 'Opening…' : ok ? 'Open another export…' : 'Open keep-one export…'}
                </button>
                {ok && (
                    <>
                        <select className={styles.select} value={shootFilter} onChange={(e) => setShootFilter(e.target.value)} aria-label="Shoot">
                            <option value="all">All shoots</option>
                            {ok.shoots.map((s) => (
                                <option key={s.shoot} value={s.shoot}>{basename(s.folder) || s.shoot}</option>
                            ))}
                        </select>
                        <select className={styles.select} value={basisFilter} onChange={(e) => setBasisFilter(e.target.value)} aria-label="Removal basis">
                            <option value="all">Any basis</option>
                            {bases.map((b) => <option key={b} value={b}>{BASIS_LABELS[b] ?? b}</option>)}
                        </select>
                        <label className={styles.check}>
                            <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} />
                            Changed since run
                        </label>
                    </>
                )}
            </div>

            <p className={styles.note}>
                Read-only. Shows keep-one study proposals: the keeper of each same-moment cluster and the frames proposed for
                soft-cull. Nothing here changes ratings, labels or files.
            </p>

            {message && <div className={styles.message} role="alert">{message}</div>}

            {ok && (
                <>
                    <div className={styles.summary}>
                        <div className={styles.stat}><span className={styles.statValue}>{ok.totals.shoots}</span><span className={styles.statLabel}>Shoots</span></div>
                        <div className={styles.stat}><span className={styles.statValue}>{ok.totals.frames.toLocaleString()}</span><span className={styles.statLabel}>Frames</span></div>
                        <div className={styles.stat}><span className={styles.statValue}>{ok.totals.clusters}</span><span className={styles.statLabel}>Clusters with removals</span></div>
                        <div className={styles.stat}><span className={styles.statValue}>{ok.totals.removed}</span><span className={styles.statLabel}>Proposed soft-culls</span></div>
                        <div className={styles.stat}><span className={styles.statValue}>{formatBytes(ok.totals.bytes)}</span><span className={styles.statLabel}>Size of proposals</span></div>
                        {ok.missingIds.length > 0 && (
                            <div className={styles.stat}><span className={styles.statValue}>{ok.missingIds.length}</span><span className={styles.statLabel}>Not in catalog</span></div>
                        )}
                    </div>
                    {clusters.length === 0 && <p className={styles.note}>No clusters match these filters.</p>}
                    {clusters.map((c) => (
                        <section key={`${c.shoot}:${c.cluster}`} className={styles.cluster} data-testid="keepone-cluster">
                            <div className={styles.clusterHead}>
                                <span className={styles.clusterTitle}>{basename(folderOf.get(c.shoot) ?? null) || c.shoot}</span>
                                <span>Cluster {c.cluster}</span>
                                <span>{c.removed.length} proposed</span>
                            </div>
                            <div className={styles.frames}>
                                <FrameCard frame={c.keeper} role="keeper" onOpenImage={onOpenImage} />
                                {c.removed.map((r) => <FrameCard key={r.imageId} frame={r} role="removed" onOpenImage={onOpenImage} />)}
                            </div>
                        </section>
                    ))}
                </>
            )}
        </div>
    );
};
