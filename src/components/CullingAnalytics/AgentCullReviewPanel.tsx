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

/**
 * Maps backend agent-review error codes to operator-facing messages. The
 * apiService embeds the HTTP status and JSON body in the thrown Error message
 * (e.g. `...returned HTTP 409: {"error":"stale_group_state"}`), and some
 * endpoints instead return `{ ok: false, error }` with HTTP 200, so we match
 * the raw string for known codes. See gallery issue #136.
 */
const KNOWN_ERRORS: Record<string, string> = {
    stale_group_state:
        'Picks changed since this review was generated. Re-run the dry-run review to refresh recommendations before applying.',
    dry_run_group:
        'This is a dry-run review — candidates can’t be marked. Re-run the review without dry-run to apply.',
    agent_review_disabled: 'Agent cull review is disabled in the backend configuration.',
};

function friendlyAgentError(raw: string): string {
    for (const [code, msg] of Object.entries(KNOWN_ERRORS)) {
        if (raw.includes(code)) return msg;
    }
    // HTTP 409 without a recognized body still means the group went stale.
    if (raw.includes('HTTP 409') || raw.includes(' 409')) return KNOWN_ERRORS.stale_group_state;
    return raw;
}

/** Extracts an error code from a `{ ok: false, error }` action result, if present. */
function resultError(result: unknown): string | null {
    if (result && typeof result === 'object') {
        const r = result as { ok?: boolean; error?: string };
        if (r.ok === false) return r.error ?? 'unknown_error';
    }
    return null;
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

    const runAction = async (fn: () => Promise<unknown>) => {
        setActionBusy(true);
        setError(null);
        try {
            const result = await fn();
            const code = resultError(result);
            if (code) {
                setError(friendlyAgentError(code));
                return; // keep the error visible; state is unchanged so no refresh
            }
            await refresh();
        } catch (e) {
            setError(friendlyAgentError(e instanceof Error ? e.message : 'Action failed'));
        } finally {
            setActionBusy(false);
        }
    };

    const handleRunReview = () => {
        const api = window.electron?.api;
        if (!api?.runAgentCullReview) return;
        void runAction(async () =>
            api.runAgentCullReview!({ stackId, subStackId: subStackId ?? undefined, dryRun: true }),
        );
    };

    const handleApprove = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.approveAgentCullGroup || !detail) return;
        void runAction(async () => api.approveAgentCullGroup!(detail.id, { recommendationIds: [rec.id] }));
    };

    const handleReject = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.rejectAgentCullGroup || !detail) return;
        void runAction(async () => api.rejectAgentCullGroup!(detail.id, { recommendationIds: [rec.id] }));
    };

    const handleRollback = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.rollbackAgentCullRecommendation) return;
        void runAction(async () => api.rollbackAgentCullRecommendation!(rec.id));
    };

    const handleApplyCandidates = () => {
        const api = window.electron?.api;
        if (!api?.applyAgentCullCandidates || !detail) return;
        void runAction(async () => api.applyAgentCullCandidates!(detail.id));
    };

    const handleKeepNeutral = (rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.updateImagePickStatus) return;
        void runAction(async () => api.updateImagePickStatus!(rec.image_id, 0));
    };

    const canRun = !!window.electron?.api?.runAgentCullReview;

    const runButton = canRun ? (
        <button
            type="button"
            className={styles.actionBtn}
            disabled={actionBusy || loading}
            onClick={handleRunReview}
            data-testid="agent-cull-run-review"
        >
            {actionBusy ? 'Running…' : 'Run dry-run review'}
        </button>
    ) : null;

    if (loading && groups.length === 0) {
        return <div className={styles.banner}>Agent cull review…</div>;
    }
    if (error && groups.length === 0) {
        return (
            <div className={styles.banner} data-testid="agent-cull-error">
                <div className={styles.bannerTitle}>Agent cull review</div>
                <div className={styles.warn}>{error}</div>
                <div className={styles.actionRow}>{runButton}</div>
            </div>
        );
    }
    if (groups.length === 0) {
        // No review exists yet for this stack/substack — offer to run one (dry-run).
        if (!canRun) return null;
        return (
            <div className={styles.banner} data-testid="agent-cull-review-panel">
                <div className={styles.bannerTitle}>Agent cull review</div>
                <div className={styles.bannerMeta}>
                    No review yet — metadata-only, no files are deleted or moved.
                </div>
                <div className={styles.actionRow}>{runButton}</div>
            </div>
        );
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
            {error && <div className={styles.warn} data-testid="agent-cull-action-error">{error}</div>}
            {runButton && <div className={styles.actionRow}>{runButton}</div>}
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
