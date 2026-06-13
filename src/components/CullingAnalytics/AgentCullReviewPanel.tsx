import { useCallback, useEffect, useState } from 'react';
import type {
    AgentCullRecommendation,
    AgentCullReviewGroupDetail,
    AgentCullReviewGroupSummary,
} from '../../types/agentCullReview';
import styles from './CullingAnalytics.module.css';

interface Props {
    stackId: number;
    subStackId?: number | null;
}

async function loadReviewData(stackId: number, subStackId: number | null | undefined) {
    const api = window.electron?.api;
    if (!api?.getAgentCullGroups) {
        return { groups: [] as AgentCullReviewGroupSummary[], detail: null as AgentCullReviewGroupDetail | null };
    }
    const list = await api.getAgentCullGroups({
        stackId,
        subStackId: subStackId ?? undefined,
        limit: 5,
    });
    const items = (list?.groups ?? []) as AgentCullReviewGroupSummary[];
    if (items.length > 0 && api.getAgentCullGroup) {
        const full = await api.getAgentCullGroup(items[0].id);
        return { groups: items, detail: full as AgentCullReviewGroupDetail };
    }
    return { groups: items, detail: null };
}

export function AgentCullReviewPanel({ stackId, subStackId = null }: Props) {
    const [groups, setGroups] = useState<AgentCullReviewGroupSummary[]>([]);
    const [detail, setDetail] = useState<AgentCullReviewGroupDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await loadReviewData(stackId, subStackId);
            setGroups(data.groups);
            setDetail(data.detail);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load agent review');
            setGroups([]);
            setDetail(null);
        } finally {
            setLoading(false);
        }
    }, [stackId, subStackId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const runAction = async (fn: () => Promise<void>) => {
        setActionBusy(true);
        setError(null);
        try {
            await fn();
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Action failed');
        } finally {
            setActionBusy(false);
        }
    };

    const handleApprove = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.approveAgentCullGroup || !detail) return;
        void runAction(async () => {
            await api.approveAgentCullGroup!(detail.id, { recommendationIds: [rec.id] });
        });
    };

    const handleReject = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.rejectAgentCullGroup || !detail) return;
        void runAction(async () => {
            await api.rejectAgentCullGroup!(detail.id, { recommendationIds: [rec.id] });
        });
    };

    const handleRollback = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.rollbackAgentCullRecommendation) return;
        void runAction(async () => {
            await api.rollbackAgentCullRecommendation!(rec.id);
        });
    };

    const handleApplyCandidates = () => {
        const api = window.electron?.api;
        if (!api?.applyAgentCullCandidates || !detail) return;
        void runAction(async () => {
            await api.applyAgentCullCandidates!(detail.id);
        });
    };

    const handleKeepNeutral = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.updateImagePickStatus) return;
        void runAction(async () => {
            await api.updateImagePickStatus!(rec.image_id, 0);
        });
    };

    if (loading && groups.length === 0) {
        return <div className={styles.banner}>Agent cull review…</div>;
    }
    if (error && groups.length === 0) {
        return (
            <div className={styles.banner} data-testid="agent-cull-error">
                Agent review unavailable: {error}
            </div>
        );
    }
    if (groups.length === 0) {
        return null;
    }

    const latest = detail ?? groups[0];
    const recommendations = detail?.recommendations ?? [];

    return (
        <div className={styles.banner} data-testid="agent-cull-review-panel">
            <div className={styles.bannerTitle}>Agent cull review</div>
            {latest.dry_run && (
                <span className={styles.chip} data-testid="agent-cull-dry-run-badge">
                    Dry run
                </span>
            )}
            <span className={styles.chip}>Status: {latest.status}</span>
            {latest.group_confidence != null && (
                <span className={styles.chip}>
                    Confidence: {Number(latest.group_confidence).toFixed(2)}
                </span>
            )}
            {latest.summary && <div className={styles.bannerSummary}>{latest.summary}</div>}
            <div className={styles.bannerMeta}>
                Metadata-only — no files are deleted or moved.
            </div>
            {error && <div className={styles.warn}>{error}</div>}
            {detail && !detail.dry_run && (
                <div className={styles.actionRow}>
                    <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={actionBusy}
                        onClick={handleApplyCandidates}
                        data-testid="agent-cull-apply-candidates"
                    >
                        Mark safe candidates
                    </button>
                </div>
            )}
            {recommendations.length > 0 && (
                <ul className={styles.recommendationList} data-testid="agent-cull-recommendations">
                    {recommendations.map((rec) => (
                        <li key={rec.id} data-testid={`agent-cull-rec-${rec.image_id}`}>
                            <strong>Image {rec.image_id}</strong>
                            {' — '}
                            {rec.final_decision}
                            {rec.confidence != null && ` (${Number(rec.confidence).toFixed(2)})`}
                            {rec.reason && `: ${rec.reason}`}
                            {rec.candidate_status !== 'none' && (
                                <span className={styles.chip}> {rec.candidate_status}</span>
                            )}
                            <div className={styles.actionRow}>
                                {rec.final_decision === 'remove' && (
                                    <button
                                        type="button"
                                        className={styles.actionBtn}
                                        disabled={actionBusy}
                                        onClick={() => handleApprove(rec)}
                                        data-testid={`agent-cull-approve-${rec.id}`}
                                    >
                                        Approve candidate
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={styles.actionBtn}
                                    disabled={actionBusy}
                                    onClick={() => handleReject(rec)}
                                    data-testid={`agent-cull-reject-${rec.id}`}
                                >
                                    Keep in review
                                </button>
                                <button
                                    type="button"
                                    className={styles.actionBtn}
                                    disabled={actionBusy}
                                    onClick={() => handleKeepNeutral(rec)}
                                    data-testid={`agent-cull-neutral-${rec.id}`}
                                >
                                    Clear pick flag
                                </button>
                                {rec.candidate_status !== 'none' && (
                                    <button
                                        type="button"
                                        className={styles.actionBtn}
                                        disabled={actionBusy}
                                        onClick={() => handleRollback(rec)}
                                        data-testid={`agent-cull-rollback-${rec.id}`}
                                    >
                                        Roll back
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
