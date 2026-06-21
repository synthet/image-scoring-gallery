import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
    AgentCullRecommendation,
    AgentCullReviewGroupDetail,
    AgentCullReviewGroupSummary,
} from '../../types/agentCullReview';
import {
    analyticsChipClassName,
    formatAgentActionError,
    friendlyAgentCandidateStatus,
    friendlyAgentDecision,
    friendlyAgentError,
    friendlyAgentGroupStatus,
    friendlyAgentReviewFailure,
} from './analyticsChipLabels';
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

/** Extracts an error code from a `{ ok: false, error }` action result, if present. */
function resultError(result: unknown): string | null {
    return formatAgentActionError(result);
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

function ReviewProgressBanner({ elapsedSec }: { elapsedSec: number }) {
    return (
        <div className={styles.reviewProgress} data-testid="agent-cull-review-progress" role="status">
            <div className={styles.reviewProgressHeader}>
                <Loader2 size={14} className="app-spinner" aria-hidden />
                <span>
                    Agent review in progress
                    {elapsedSec > 0 ? ` (${elapsedSec}s)` : '…'}
                </span>
            </div>
            <div className={styles.reviewProgressTrack} aria-hidden>
                <div className={styles.reviewProgressFill} />
            </div>
            <div className={styles.reviewProgressHint}>
                Calling the backend agent CLI — usually 30–90 seconds. You can keep browsing this stack.
            </div>
        </div>
    );
}

export function AgentCullReviewPanel({ stackId, subStackId = null }: Props) {
    const [groups, setGroups] = useState<AgentCullReviewGroupSummary[]>([]);
    const [detail, setDetail] = useState<AgentCullReviewGroupDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [reviewRunning, setReviewRunning] = useState(false);
    const [reviewElapsedSec, setReviewElapsedSec] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const reviewStartedAtRef = useRef<number | null>(null);
    const reviewRunningRef = useRef(false);

    useEffect(() => {
        reviewRunningRef.current = reviewRunning;
    }, [reviewRunning]);

    useEffect(() => {
        if (!reviewRunning) {
            reviewStartedAtRef.current = null;
            setReviewElapsedSec(0);
            return;
        }
        reviewStartedAtRef.current = Date.now();
        setReviewElapsedSec(0);
        const timer = window.setInterval(() => {
            const started = reviewStartedAtRef.current;
            if (started == null) return;
            setReviewElapsedSec(Math.floor((Date.now() - started) / 1000));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [reviewRunning]);

    const reviewProgress = reviewRunning ? (
        <ReviewProgressBanner elapsedSec={reviewElapsedSec} />
    ) : null;

    const refresh = useCallback(async (options?: { clearError?: boolean; force?: boolean }) => {
        if (reviewRunningRef.current && !options?.force) {
            return;
        }
        setLoading(true);
        if (options?.clearError !== false) {
            setError(null);
        }
        try {
            const data = await loadReviewData(stackId, subStackId);
            setGroups(data.groups);
            setDetail(data.detail);
        } catch (e) {
            setError(friendlyAgentError(e instanceof Error ? e.message : 'Failed to load agent review'));
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
                const groupId =
                    result && typeof result === 'object' && 'group_id' in result
                        ? (result as { group_id?: number }).group_id
                        : undefined;
                if (groupId) {
                    await refresh({ clearError: false, force: true });
                }
                setError(code);
                return;
            }
            await refresh({ force: true });
        } catch (e) {
            setError(friendlyAgentError(e instanceof Error ? e.message : 'Action failed'));
        } finally {
            setActionBusy(false);
        }
    };

    const handleRunReview = () => {
        const api = window.electron?.api;
        if (!api?.runAgentCullReview) return;
        setReviewRunning(true);
        void runAction(async () =>
            api.runAgentCullReview!({ stackId, subStackId: subStackId ?? undefined, dryRun: true }),
        ).finally(() => setReviewRunning(false));
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

    if (loading && groups.length === 0 && !reviewRunning) {
        return <div className={styles.banner}>Agent cull review…</div>;
    }
    if (error && groups.length === 0) {
        return (
            <div className={styles.banner} data-testid="agent-cull-error">
                <div className={styles.bannerTitle}>Agent cull review</div>
                {reviewProgress}
                {!reviewRunning && <div className={styles.warn}>{error}</div>}
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
                {reviewProgress}
                {!reviewRunning && (
                    <div className={styles.bannerMeta}>
                        No review yet — metadata-only, no files are deleted or moved.
                    </div>
                )}
                <div className={styles.actionRow}>{runButton}</div>
            </div>
        );
    }

    const latest = detail ?? groups[0];
    const recommendations = detail?.recommendations ?? [];
    const groupFailureMessage =
        latest.status === 'failed'
            ? friendlyAgentReviewFailure(latest.error_code, latest.error_message)
            : null;

    return (
        <div className={styles.banner} data-testid="agent-cull-review-panel">
            <div className={styles.bannerTitle}>Agent cull review</div>
            {latest.dry_run && (
                <span className={styles.chip} data-testid="agent-cull-dry-run-badge">
                    Dry run
                </span>
            )}
            <span className={styles.chip}>Status: {friendlyAgentGroupStatus(latest.status)}</span>
            {latest.group_confidence != null && (
                <span className={styles.chip}>
                    Confidence: {Number(latest.group_confidence).toFixed(2)}
                </span>
            )}
            {latest.summary && <div className={styles.bannerSummary}>{latest.summary}</div>}
            <div className={styles.bannerMeta}>
                Metadata-only — no files are deleted or moved.
            </div>
            {reviewProgress}
            {!reviewRunning && (error || groupFailureMessage) && (
                <div className={styles.warn} data-testid="agent-cull-action-error">
                    {error || groupFailureMessage}
                </div>
            )}
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
                            {friendlyAgentDecision(rec.final_decision)}
                            {rec.confidence != null && ` (${Number(rec.confidence).toFixed(2)})`}
                            {rec.reason && `: ${rec.reason}`}
                            {rec.candidate_status !== 'none' && (() => {
                                const candidate = friendlyAgentCandidateStatus(rec.candidate_status);
                                return (
                                    <span className={analyticsChipClassName(styles, candidate.warn)}>
                                        {' '}
                                        {candidate.text}
                                    </span>
                                );
                            })()}
                            {rec.agent_decision !== 'advisory'
                                && rec.candidate_status !== 'pick_quality_advisory'
                                && (
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
                                )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
