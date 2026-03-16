import { create } from 'zustand';

// ── Data contract (mirrors planning doc + backend phase codes) ───────────────

/** Frontend phase keys used in UI. Backend uses different codes — see PHASE_CODE_MAP. */
export type PhaseKey = 'index' | 'meta' | 'scoring' | 'culling' | 'keywords';

/**
 * Mapping from backend phase_code to frontend PhaseKey.
 * Backend: 'indexing' | 'metadata' | 'score' | 'tag' | 'cluster'
 */
export const PHASE_CODE_MAP: Record<string, PhaseKey> = {
    indexing: 'index',
    metadata: 'meta',
    score: 'scoring',
    tag: 'keywords',
    cluster: 'culling',
};

/**
 * Mapping from frontend PhaseKey back to backend phase_code.
 * Used when submitting single-phase run/skip/retry requests.
 */
export const BACKEND_PHASE_CODE: Record<PhaseKey, string> = {
    index: 'indexing',
    meta: 'metadata',
    scoring: 'score',
    keywords: 'tag',
    culling: 'cluster',
};

/** Display labels for each phase. */
export const PHASE_LABELS: Record<PhaseKey, string> = {
    index: 'Index',
    meta: 'Metadata',
    scoring: 'Scoring',
    keywords: 'Keywords',
    culling: 'Culling',
};

export const ALL_PHASES: PhaseKey[] = ['index', 'meta', 'scoring', 'keywords', 'culling'];

export type PhaseStatus = 'not_started' | 'queued' | 'running' | 'done' | 'skipped' | 'failed';

export interface ProcessingPhaseState {
    phase: PhaseKey;
    status: PhaseStatus;
    processed: number;
    total: number;
    startedAt?: string;
    endedAt?: string;
    message?: string;
    canRun: boolean;
    canSkip: boolean;
    canRetry: boolean;
}

export interface WorkerLogEntry {
    ts: string;
    level: 'info' | 'warn' | 'error';
    source: 'pipeline' | 'worker' | 'api' | 'system';
    message: string;
}

const LOG_BUFFER_MAX = 500;

function makeDefaultPhases(): ProcessingPhaseState[] {
    return ALL_PHASES.map((phase) => ({
        phase,
        status: 'not_started',
        processed: 0,
        total: 0,
        canRun: true,
        canSkip: true,
        canRetry: false,
    }));
}

// ── Store interface ───────────────────────────────────────────────────────────

interface ProcessingStore {
    folderPath: string | null;
    phases: ProcessingPhaseState[];
    queueDepth: number;
    logBuffer: WorkerLogEntry[];
    actor: string;

    setFolder: (path: string | null) => void;
    setPhases: (phases: ProcessingPhaseState[]) => void;
    updatePhase: (phase: PhaseKey, update: Partial<ProcessingPhaseState>) => void;
    appendLog: (entry: WorkerLogEntry) => void;
    clearLog: () => void;
    setQueueDepth: (n: number) => void;
    setActor: (actor: string) => void;
    reset: () => void;
}

export const useProcessingStore = create<ProcessingStore>((set) => ({
    folderPath: null,
    phases: makeDefaultPhases(),
    queueDepth: 0,
    logBuffer: [],
    actor: '',

    setFolder: (path) =>
        set({ folderPath: path, phases: makeDefaultPhases(), logBuffer: [] }),

    setPhases: (phases) => set({ phases }),

    updatePhase: (phase, update) =>
        set((state) => ({
            phases: state.phases.map((p) =>
                p.phase === phase ? { ...p, ...update } : p,
            ),
        })),

    appendLog: (entry) =>
        set((state) => {
            const next = [...state.logBuffer, entry];
            return {
                logBuffer: next.length > LOG_BUFFER_MAX ? next.slice(next.length - LOG_BUFFER_MAX) : next,
            };
        }),

    clearLog: () => set({ logBuffer: [] }),

    setQueueDepth: (n) => set({ queueDepth: n }),

    setActor: (actor) => set({ actor }),

    reset: () =>
        set({
            folderPath: null,
            phases: makeDefaultPhases(),
            queueDepth: 0,
            logBuffer: [],
            actor: '',
        }),
}));
