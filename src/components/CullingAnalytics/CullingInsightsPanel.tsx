import { useEffect, useState, type ReactNode } from 'react';
import type { CullingAnalyticsResponse } from '../../types/cullingAnalytics';
import styles from './CullingAnalytics.module.css';

interface Props {
    folderPath?: string;
    folderId?: number;
    stacksMode: boolean;
    collapsed?: boolean;
}

export function CullingInsightsPanel({ folderPath, folderId, stacksMode, collapsed: initialCollapsed = true }: Props) {
    const [collapsed, setCollapsed] = useState(initialCollapsed);
    const [data, setData] = useState<CullingAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!stacksMode && !folderPath && folderId === undefined) {
            setData(null);
            return;
        }

        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const api = window.electron?.api;
                if (!api?.getCullingAnalytics) {
                    setError('Analytics unavailable');
                    return;
                }
                const raw = await api.getCullingAnalytics({
                    folderPath,
                    folderId,
                    perStackLimit: 10,
                });
                if (!cancelled) {
                    setData(raw as CullingAnalyticsResponse);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'Failed to load analytics');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [folderPath, folderId, stacksMode]);

    if (!stacksMode && !folderPath && folderId === undefined) {
        return null;
    }

    const ss = data?.stack_size;
    const fl = data?.flags;
    const em = data?.embeddings as { coverage_pct?: number } | undefined;
    const comp = data?.composite;

    return (
        <div className={styles.panel}>
            <button
                type="button"
                className={styles.panelHeader}
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
            >
                <span>Culling insights</span>
                <span className={styles.chevron}>{collapsed ? '▸' : '▾'}</span>
            </button>
            {!collapsed && (
                <PanelBody loading={loading} error={error} data={data}>
                    {ss && (
                        <StatRow label="Stacks" value={`${ss.total_stacks ?? 0} (${ss.total_stacked_images ?? 0} images)`} />
                    )}
                    {ss && (
                        <StatRow
                            label="Singleton stacks"
                            value={`${ss.singleton_stacks ?? 0} (${ss.singleton_pct ?? 0}%)`}
                        />
                    )}
                    {fl && (
                        <StatRow
                            label="Picked / reject"
                            value={`${fl.pick_count ?? 0} / ${fl.reject_count ?? 0}`}
                        />
                    )}
                    {fl && (fl.stacks_needing_review ?? 0) > 0 && (
                        <StatRow label="Needs review" value={String(fl.stacks_needing_review)} warn />
                    )}
                    {em?.coverage_pct !== undefined && (
                        <StatRow label="Embedding coverage" value={`${em.coverage_pct}%`} />
                    )}
                    {comp?.review_priority_score !== undefined && (
                        <StatRow label="Review priority" value={comp.review_priority_score.toFixed(2)} />
                    )}
                    {data?.warnings && data.warnings.length > 0 && (
                        <div className={styles.warn}>{data.warnings.slice(0, 3).join(' · ')}</div>
                    )}
                </PanelBody>
            )}
        </div>
    );
}

function PanelBody({
    loading,
    error,
    data,
    children,
}: {
    loading: boolean;
    error: string | null;
    data: CullingAnalyticsResponse | null;
    children: ReactNode;
}) {
    if (loading) {
        return <div className={styles.bodyMuted}>Loading…</div>;
    }
    if (error) {
        return <div className={styles.bodyMuted}>{error}</div>;
    }
    if (data?.error) {
        return <div className={styles.bodyMuted}>{data.error}</div>;
    }
    return <div className={styles.body}>{children}</div>;
}

function StatRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
    return (
        <div className={warn ? styles.rowWarn : styles.row}>
            <span className={styles.label}>{label}</span>
            <span className={styles.value}>{value}</span>
        </div>
    );
}
