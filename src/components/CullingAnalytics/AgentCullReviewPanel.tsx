import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import type { AgentCullRecommendation, AgentCullReviewGroupDetail } from '../../types/agentCullReview';
import {
    agentRecommendationBadge,
    agentRecommendationTone,
    formatAgentSummaryDigest,
    friendlyAgentCandidateStatus,
    friendlyAgentGroupStatus,
    friendlyAgentReviewFailure,
    isAdvisoryRecommendation,
    type AgentRecommendationTone,
} from './analyticsChipLabels';
import { useAgentCullReview, type AgentCullReviewState } from '../../hooks/useAgentCullReview';
import styles from './AgentCullReviewPanel.module.css';

interface Props {
    stackId: number;
    subStackId?: number | null;
    /** Shared review state (from AppContent). When omitted the panel self-provisions via the hook. */
    review?: AgentCullReviewState;
    /** image_id → file name, joined from the grid's loaded images for friendly card titles. */
    fileNames?: Map<number, string>;
    /** Notifies the parent which image a card targets, to scroll-to + highlight the grid cell. */
    onFocusImage?: (imageId: number) => void;
}

const BADGE_CLASS: Record<AgentRecommendationTone, string> = {
    remove: styles.badgeRemove,
    advisory: styles.badgeAdvisory,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    neutral: styles.badgeNeutral,
};

const TONE_CLASS: Record<AgentRecommendationTone, string> = {
    remove: styles.toneRemove,
    advisory: styles.toneAdvisory,
    approved: styles.toneApproved,
    rejected: styles.toneRejected,
    neutral: styles.toneNeutral,
};

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

const WORKFLOW_STEPS = ['Dry-run', 'Review', 'Live run', 'Mark candidates'] as const;

function currentWorkflowStep(detail: AgentCullReviewGroupDetail | null): number {
    if (!detail) return 0;
    if (detail.status === 'applied') return WORKFLOW_STEPS.length;
    if (detail.dry_run) return 1;
    return 3;
}

function WorkflowStepper({ detail }: { detail: AgentCullReviewGroupDetail | null }) {
    const current = currentWorkflowStep(detail);
    return (
        <div className={styles.stepper} data-testid="agent-cull-stepper" aria-label="Agent review workflow">
            {WORKFLOW_STEPS.map((label, idx) => {
                const done = idx < current;
                const active = idx === current;
                const cls = active ? `${styles.step} ${styles.stepActive}` : done ? `${styles.step} ${styles.stepDone}` : styles.step;
                return (
                    <Fragment key={label}>
                        {idx > 0 && <span className={styles.stepConnector} aria-hidden>›</span>}
                        <span className={cls} aria-current={active ? 'step' : undefined}>
                            {label}
                        </span>
                    </Fragment>
                );
            })}
        </div>
    );
}

function ConfidencePill({ value }: { value: number }) {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return (
        <span className={styles.confidencePill} title={`Confidence ${value.toFixed(2)}`}>
            <span className={styles.confidenceTrack} aria-hidden>
                <span className={styles.confidenceFill} style={{ width: `${pct}%` }} />
            </span>
            {pct}%
        </span>
    );
}

function RecommendationCard({
    rec,
    fileName,
    busy,
    onApprove,
    onReject,
    onRollback,
    onNeutral,
    onFocus,
}: {
    rec: AgentCullRecommendation;
    fileName?: string;
    busy: boolean;
    onApprove: () => void;
    onReject: () => void;
    onRollback: () => void;
    onNeutral: () => void;
    onFocus?: (imageId: number) => void;
}) {
    const [reasonOpen, setReasonOpen] = useState(false);
    const tone = agentRecommendationTone(rec);
    const advisory = isAdvisoryRecommendation(rec);
    const candidate = rec.candidate_status !== 'none' ? friendlyAgentCandidateStatus(rec.candidate_status) : null;
    const title = fileName ?? `Image #${rec.image_id}`;
    const hasReason = !!rec.reason && rec.reason.trim().length > 0;

    return (
        <li className={`${styles.card} ${TONE_CLASS[tone]}`} data-testid={`agent-cull-rec-${rec.image_id}`}>
            <div className={styles.cardHeader}>
                <button
                    type="button"
                    className={styles.cardName}
                    title={`${title} — show in grid`}
                    onClick={() => onFocus?.(rec.image_id)}
                    data-testid={`agent-cull-rec-focus-${rec.image_id}`}
                >
                    {title}
                </button>
                <span className={`${styles.badge} ${BADGE_CLASS[tone]}`}>{agentRecommendationBadge(rec)}</span>
                {rec.confidence != null && <ConfidencePill value={Number(rec.confidence)} />}
            </div>

            {hasReason && (
                <div
                    className={reasonOpen ? styles.reason : `${styles.reason} ${styles.reasonClamped}`}
                    onClick={() => setReasonOpen((v) => !v)}
                    title={reasonOpen ? 'Collapse' : 'Expand'}
                >
                    {rec.reason}
                </div>
            )}

            {candidate && (
                <span
                    className={`${styles.chip} ${candidate.warn ? styles.chipWarn : advisory ? styles.chipInfo : ''} ${styles.candidateChip}`}
                >
                    {candidate.text}
                </span>
            )}

            {!advisory && (
                <div className={styles.actionRow}>
                    {rec.final_decision === 'remove' && (
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            disabled={busy}
                            onClick={onApprove}
                            data-testid={`agent-cull-approve-${rec.id}`}
                        >
                            Approve
                        </button>
                    )}
                    <button
                        type="button"
                        className={styles.btn}
                        disabled={busy}
                        onClick={onReject}
                        data-testid={`agent-cull-reject-${rec.id}`}
                    >
                        Keep in review
                    </button>
                    <details className={styles.overflow}>
                        <summary className={styles.overflowSummary} aria-label="More actions">
                            <MoreHorizontal size={14} aria-hidden />
                        </summary>
                        <div className={styles.overflowMenu}>
                            <button
                                type="button"
                                className={styles.btn}
                                disabled={busy}
                                onClick={onNeutral}
                                data-testid={`agent-cull-neutral-${rec.id}`}
                            >
                                Clear pick flag
                            </button>
                            {rec.candidate_status !== 'none' && (
                                <button
                                    type="button"
                                    className={styles.btn}
                                    disabled={busy}
                                    onClick={onRollback}
                                    data-testid={`agent-cull-rollback-${rec.id}`}
                                >
                                    Roll back
                                </button>
                            )}
                        </div>
                    </details>
                </div>
            )}

            {advisory && rec.better_alternatives && rec.better_alternatives.length > 0 && onFocus && (
                <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => onFocus(rec.better_alternatives![0])}
                    data-testid={`agent-cull-alternatives-${rec.id}`}
                >
                    View suggested alternative
                </button>
            )}
        </li>
    );
}

export function AgentCullReviewPanel({ stackId, subStackId = null, review, fileNames, onFocusImage }: Props) {
    const localReview = useAgentCullReview(stackId, subStackId, { enabled: !review });
    const r = review ?? localReview;

    const [expanded, setExpanded] = useState(true);
    const [showFull, setShowFull] = useState(false);

    const {
        groups,
        detail,
        recommendations,
        loading,
        actionBusy,
        reviewRunning,
        reviewElapsedSec,
        error,
        canRun,
    } = r;

    const removable = useMemo(
        () => recommendations.filter((rec) => rec.final_decision === 'remove' && !isAdvisoryRecommendation(rec)),
        [recommendations],
    );
    const pendingRemovable = useMemo(
        () =>
            removable.filter(
                (rec) => rec.candidate_status !== 'operator_approved' && rec.candidate_status !== 'operator_rejected',
            ),
        [removable],
    );
    const advisoryCount = useMemo(
        () => recommendations.filter((rec) => isAdvisoryRecommendation(rec)).length,
        [recommendations],
    );

    const reviewProgress = reviewRunning ? <ReviewProgressBanner elapsedSec={reviewElapsedSec} /> : null;

    const runDryButton = canRun ? (
        <button
            type="button"
            className={styles.btn}
            disabled={actionBusy || loading}
            onClick={() => r.runReview(true)}
            data-testid="agent-cull-run-review"
        >
            {actionBusy ? 'Running…' : groups.length === 0 ? 'Run dry-run review' : 'Re-run dry-run'}
        </button>
    ) : null;

    if (loading && groups.length === 0 && !reviewRunning) {
        return <div className={styles.panel}><div className={styles.body}>Agent cull review…</div></div>;
    }

    if (error && groups.length === 0) {
        return (
            <div className={styles.panel} data-testid="agent-cull-error">
                <div className={styles.header}>
                    <span className={styles.title}>Agent cull review</span>
                </div>
                <div className={styles.body}>
                    {reviewProgress}
                    {!reviewRunning && <div className={styles.error}>{error}</div>}
                    <div className={styles.actionRow}>{runDryButton}</div>
                </div>
            </div>
        );
    }

    if (groups.length === 0) {
        if (!canRun) return null;
        return (
            <div className={styles.panel} data-testid="agent-cull-review-panel">
                <div className={styles.header}>
                    <span className={styles.title}>Agent cull review</span>
                </div>
                <div className={styles.body}>
                    {reviewProgress}
                    {!reviewRunning && (
                        <div className={styles.meta}>No review yet — metadata-only, no files are deleted or moved.</div>
                    )}
                    <div className={styles.actionRow}>{runDryButton}</div>
                </div>
            </div>
        );
    }

    const latest = detail ?? groups[0];
    const groupFailureMessage =
        latest.status === 'failed' ? friendlyAgentReviewFailure(latest.error_code, latest.error_message) : null;
    const digest = formatAgentSummaryDigest(latest.summary);
    const isDryRun = !!latest.dry_run;
    const canRunLive = canRun && !!detail && isDryRun && latest.status !== 'failed';

    return (
        <div className={styles.panel} data-testid="agent-cull-review-panel" role="region" aria-label="Agent cull review">
            <div className={styles.header}>
                <button
                    type="button"
                    className={styles.collapseBtn}
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    data-testid="agent-cull-collapse"
                >
                    {expanded ? <ChevronDown size={16} className={styles.chevron} aria-hidden /> : <ChevronRight size={16} className={styles.chevron} aria-hidden />}
                    <span className={styles.title}>Agent cull review</span>
                </button>
                <div className={styles.headerActions}>
                    {runDryButton}
                    {canRunLive && (
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            disabled={actionBusy}
                            onClick={() => r.runReview(false)}
                            data-testid="agent-cull-run-live"
                        >
                            Run live review
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.chipRow}>
                {isDryRun && (
                    <span className={styles.chip} data-testid="agent-cull-dry-run-badge">
                        Dry run
                    </span>
                )}
                <span className={styles.chip}>Status: {friendlyAgentGroupStatus(latest.status)}</span>
                {latest.group_confidence != null && (
                    <span className={styles.chip}>Confidence: {Number(latest.group_confidence).toFixed(2)}</span>
                )}
                {removable.length > 0 && (
                    <span className={`${styles.chip} ${styles.chipWarn}`}>{removable.length} removal{removable.length === 1 ? '' : 's'} suggested</span>
                )}
                {advisoryCount > 0 && (
                    <span className={`${styles.chip} ${styles.chipInfo}`}>{advisoryCount} advisor{advisoryCount === 1 ? 'y' : 'ies'}</span>
                )}
                {pendingRemovable.length > 0 && (
                    <span className={styles.chip}>{pendingRemovable.length} pending your review</span>
                )}
            </div>

            <WorkflowStepper detail={detail} />

            {expanded && (
                <div className={styles.body}>
                    {digest.digest && (
                        <div className={styles.digest}>
                            {showFull && latest.summary ? latest.summary : digest.digest}
                            {digest.hasMore && (
                                <button
                                    type="button"
                                    className={styles.linkBtn}
                                    onClick={() => setShowFull((v) => !v)}
                                    data-testid="agent-cull-show-full"
                                >
                                    {showFull ? 'Show less' : 'Show full analysis'}
                                </button>
                            )}
                        </div>
                    )}

                    <div className={styles.meta}>Metadata-only — no files are deleted or moved.</div>

                    {reviewProgress}

                    {!reviewRunning && (error || groupFailureMessage) && (
                        <div className={styles.error} data-testid="agent-cull-action-error">
                            {error || groupFailureMessage}
                        </div>
                    )}

                    {canRunLive && (
                        <div className={styles.liveWarn} data-testid="agent-cull-live-hint">
                            Live review records operator-facing remove candidates. Still metadata-only — no file is deleted.
                        </div>
                    )}

                    {detail && !detail.dry_run && (
                        <div className={styles.actionRow}>
                            <button
                                type="button"
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                disabled={actionBusy}
                                onClick={() => r.applyCandidates()}
                                data-testid="agent-cull-apply-candidates"
                            >
                                Mark safe candidates
                            </button>
                        </div>
                    )}

                    {pendingRemovable.length > 1 && (
                        <div className={styles.bulkRow} data-testid="agent-cull-bulk">
                            <span className={styles.bulkLabel}>Bulk:</span>
                            <button
                                type="button"
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                disabled={actionBusy}
                                onClick={() => r.approveAll(pendingRemovable)}
                                data-testid="agent-cull-approve-all"
                            >
                                Approve all removals
                            </button>
                            <button
                                type="button"
                                className={styles.btn}
                                disabled={actionBusy}
                                onClick={() => r.dismissAll(pendingRemovable)}
                                data-testid="agent-cull-dismiss-all"
                            >
                                Dismiss all
                            </button>
                        </div>
                    )}

                    {recommendations.length > 0 && (
                        <ul className={styles.cardList} data-testid="agent-cull-recommendations">
                            {recommendations.map((rec) => (
                                <RecommendationCard
                                    key={rec.id}
                                    rec={rec}
                                    fileName={fileNames?.get(rec.image_id)}
                                    busy={actionBusy}
                                    onApprove={() => r.approve(rec)}
                                    onReject={() => r.reject(rec)}
                                    onRollback={() => r.rollback(rec)}
                                    onNeutral={() => r.keepNeutral(rec)}
                                    onFocus={onFocusImage}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
