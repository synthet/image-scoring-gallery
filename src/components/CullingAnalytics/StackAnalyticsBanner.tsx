import { useEffect, useState } from 'react';
import type { CullingAnalyticsResponse } from '../../types/cullingAnalytics';
import {
    analyticsChipClassName,
    formatAnalyticsWarning,
    formatDecisionChip,
    type AnalyticsChip,
} from './analyticsChipLabels';
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

    const chips: AnalyticsChip[] = [];
    const decisions = data.decisions;
    if (decisions) {
        const pick = Number(decisions.pick ?? 0);
        const reject = Number(decisions.reject ?? 0);
        const neutral = Number(decisions.neutral ?? 0);
        if (pick > 0) {
            chips.push(formatDecisionChip('pick', pick));
        }
        if (reject > 0) {
            chips.push(formatDecisionChip('reject', reject));
        }
        if (neutral > 0) {
            chips.push(formatDecisionChip('neutral', neutral));
        }
    }
    if (gap !== undefined && gap !== null) {
        chips.push({
            key: 'score-gap',
            text: `Top score gap: ${Number(gap).toFixed(2)}`,
        });
    }
    if (emb?.avg_cosine_similarity !== undefined) {
        chips.push({
            key: 'visual-sim',
            text: `Visual similarity: ${Number(emb.avg_cosine_similarity).toFixed(2)}`,
            warn: Boolean(emb.visually_mixed),
        });
    }
    if (exposure?.likely_burst) {
        chips.push({ key: 'likely-burst', text: 'Likely burst' });
    }

    const seenWarnings = new Set<string>();
    const addWarningChip = (raw: string) => {
        if (seenWarnings.has(raw)) return;
        seenWarnings.add(raw);
        const formatted = formatAnalyticsWarning(raw);
        chips.push({
            key: `warning-${raw}`,
            text: formatted.text,
            warn: formatted.warn,
        });
    };

    for (const w of exposure?.warnings ?? []) {
        addWarningChip(w);
    }
    for (const w of warnings) {
        addWarningChip(w);
    }

    if (chips.length === 0) {
        return null;
    }

    return (
        <div className={styles.banner} role="status" aria-label="Stack analytics">
            {chips.map((c) => (
                <span key={c.key} className={analyticsChipClassName(styles, c.warn)}>
                    {c.text}
                </span>
            ))}
        </div>
    );
}
