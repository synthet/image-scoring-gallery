import { useEffect, useState } from 'react';
import type { CullingAnalyticsResponse } from '../../types/cullingAnalytics';
import styles from './CullingAnalytics.module.css';

interface Props {
    stackId: number;
}

export function StackAnalyticsBanner({ stackId }: Props) {
    const [data, setData] = useState<CullingAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const api = window.electron?.api;
                if (!api?.getStackAnalytics) return;
                const raw = await api.getStackAnalytics(stackId);
                if (!cancelled) {
                    setData(raw as CullingAnalyticsResponse);
                }
            } catch {
                if (!cancelled) setData(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [stackId]);

    if (loading) {
        return <div className={styles.banner}>Stack analytics…</div>;
    }
    if (!data || data.error) {
        return null;
    }

    const scoresBlock = data.scores as {
        score_gap_top_two?: number;
        top_score?: number;
    } | undefined;
    const gap = scoresBlock?.score_gap_top_two;
    const exposure = data.exposure as { warnings?: string[]; likely_burst?: boolean } | undefined;
    const emb = data.embeddings as { avg_cosine_similarity?: number; visually_mixed?: boolean } | undefined;
    const warnings = data.warnings ?? [];

    const chips: { text: string; warn?: boolean }[] = [];
    if (gap !== undefined && gap !== null) {
        chips.push({ text: `Top gap: ${Number(gap).toFixed(3)}` });
    }
    if (emb?.avg_cosine_similarity !== undefined) {
        chips.push({
            text: `Visual sim: ${Number(emb.avg_cosine_similarity).toFixed(2)}`,
            warn: Boolean(emb.visually_mixed),
        });
    }
    if (exposure?.likely_burst) {
        chips.push({ text: 'Likely burst' });
    }
    for (const w of exposure?.warnings ?? []) {
        chips.push({ text: w, warn: true });
    }
    for (const w of warnings.slice(0, 2)) {
        chips.push({ text: w, warn: true });
    }

    if (chips.length === 0) {
        return null;
    }

    return (
        <div className={styles.banner} role="status" aria-label="Stack analytics">
            {chips.map((c) => (
                <span key={c.text} className={c.warn ? styles.chipWarn : styles.chip}>
                    {c.text}
                </span>
            ))}
        </div>
    );
}
