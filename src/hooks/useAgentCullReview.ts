import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
    AgentCullRecommendation,
    AgentCullReviewGroupDetail,
    AgentCullReviewGroupSummary,
} from '../types/agentCullReview';
import { friendlyAgentError, formatAgentActionError } from '../components/CullingAnalytics/analyticsChipLabels';

/** Shared, reusable state + actions for the agent cull review of one stack/sub-stack.
 *
 * Lifted out of `AgentCullReviewPanel` so the panel and the gallery grid can render
 * the same recommendations (cards + thumbnail overlays) from a single fetch. Mount it
 * once near the active stack and thread the returned object to both consumers; pass
 * `enabled: false` on instances that should not fetch (e.g. a panel handed a shared
 * object via prop) to avoid duplicate IPC calls. See gallery plan "Agent Cull UX".
 */
export interface AgentCullReviewState {
    groups: AgentCullReviewGroupSummary[];
    detail: AgentCullReviewGroupDetail | null;
    recommendations: AgentCullRecommendation[];
    /** image_id → recommendation, for grid overlay + filename joins. */
    recommendationsByImageId: Map<number, AgentCullRecommendation>;
    loading: boolean;
    actionBusy: boolean;
    reviewRunning: boolean;
    reviewElapsedSec: number;
    error: string | null;
    /** True when the IPC bridge exposes the run endpoint. */
    canRun: boolean;
    refresh: (options?: { clearError?: boolean; force?: boolean }) => Promise<void>;
    /**
     * Run the agent review. `force` re-runs even when a group already exists for the unit
     * (required for the live run and any re-run, since the dry-run leaves a `proposed` group —
     * without it the backend returns `existing_review`).
     */
    runReview: (dryRun: boolean, opts?: { force?: boolean }) => void;
    approve: (rec: AgentCullRecommendation) => void;
    reject: (rec: AgentCullRecommendation) => void;
    rollback: (rec: AgentCullRecommendation) => void;
    keepNeutral: (rec: AgentCullRecommendation) => void;
    applyCandidates: () => void;
    /**
     * IRREVERSIBLE. Permanently delete the file + DB record for every operator-approved
     * removal in the current (validated) group. The caller must have already confirmed.
     */
    deleteApproved: () => void;
    /** Bulk: approve every removable recommendation in one IPC call. */
    approveAll: (recs: AgentCullRecommendation[]) => void;
    /** Bulk: dismiss (keep in review) every removable recommendation in one IPC call. */
    dismissAll: (recs: AgentCullRecommendation[]) => void;
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

export function useAgentCullReview(
    stackId: number,
    subStackId: number | null = null,
    options?: { enabled?: boolean },
): AgentCullReviewState {
    const enabled = options?.enabled !== false;

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

    const refresh = useCallback(async (opts?: { clearError?: boolean; force?: boolean }) => {
        if (!enabled) return;
        if (reviewRunningRef.current && !opts?.force) {
            return;
        }
        setLoading(true);
        if (opts?.clearError !== false) {
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
    }, [enabled, stackId, subStackId]);

    useEffect(() => {
        if (!enabled) return;
        void refresh();
    }, [enabled, refresh]);

    const runAction = useCallback(async (fn: () => Promise<unknown>) => {
        setActionBusy(true);
        setError(null);
        try {
            const result = await fn();
            const code = formatAgentActionError(result);
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
    }, [refresh]);

    const runReview = useCallback((dryRun: boolean, opts?: { force?: boolean }) => {
        const api = window.electron?.api;
        if (!api?.runAgentCullReview) return;
        setReviewRunning(true);
        void runAction(async () =>
            api.runAgentCullReview!({ stackId, subStackId: subStackId ?? undefined, dryRun, force: opts?.force }),
        ).finally(() => setReviewRunning(false));
    }, [runAction, stackId, subStackId]);

    const approve = useCallback((rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.approveAgentCullGroup || !detail) return;
        void runAction(async () => api.approveAgentCullGroup!(detail.id, { recommendationIds: [rec.id] }));
    }, [detail, runAction]);

    const reject = useCallback((rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.rejectAgentCullGroup || !detail) return;
        void runAction(async () => api.rejectAgentCullGroup!(detail.id, { recommendationIds: [rec.id] }));
    }, [detail, runAction]);

    const rollback = useCallback((rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.rollbackAgentCullRecommendation) return;
        void runAction(async () => api.rollbackAgentCullRecommendation!(rec.id));
    }, [runAction]);

    const keepNeutral = useCallback((rec: AgentCullRecommendation) => {
        const api = window.electron?.api;
        if (!api?.updateImagePickStatus) return;
        void runAction(async () => api.updateImagePickStatus!(rec.image_id, 0));
    }, [runAction]);

    const applyCandidates = useCallback(() => {
        const api = window.electron?.api;
        if (!api?.applyAgentCullCandidates || !detail) return;
        void runAction(async () => api.applyAgentCullCandidates!(detail.id));
    }, [detail, runAction]);

    const deleteApproved = useCallback(() => {
        const api = window.electron?.api;
        if (!api?.deleteApprovedAgentCullCandidates || !detail) return;
        void runAction(async () => api.deleteApprovedAgentCullCandidates!(detail.id, { confirm: true }));
    }, [detail, runAction]);

    const approveAll = useCallback((recs: AgentCullRecommendation[]) => {
        const api = window.electron?.api;
        if (!api?.approveAgentCullGroup || !detail) return;
        const ids = recs.map((r) => r.id);
        if (ids.length === 0) return;
        void runAction(async () => api.approveAgentCullGroup!(detail.id, { recommendationIds: ids }));
    }, [detail, runAction]);

    const dismissAll = useCallback((recs: AgentCullRecommendation[]) => {
        const api = window.electron?.api;
        if (!api?.rejectAgentCullGroup || !detail) return;
        const ids = recs.map((r) => r.id);
        if (ids.length === 0) return;
        void runAction(async () => api.rejectAgentCullGroup!(detail.id, { recommendationIds: ids }));
    }, [detail, runAction]);

    const recommendations = useMemo(() => detail?.recommendations ?? [], [detail]);

    const recommendationsByImageId = useMemo(() => {
        const map = new Map<number, AgentCullRecommendation>();
        for (const rec of recommendations) {
            map.set(rec.image_id, rec);
        }
        return map;
    }, [recommendations]);

    const canRun = !!window.electron?.api?.runAgentCullReview;

    return {
        groups,
        detail,
        recommendations,
        recommendationsByImageId,
        loading,
        actionBusy,
        reviewRunning,
        reviewElapsedSec,
        error,
        canRun,
        refresh,
        runReview,
        approve,
        reject,
        rollback,
        keepNeutral,
        applyCandidates,
        deleteApproved,
        approveAll,
        dismissAll,
    };
}
