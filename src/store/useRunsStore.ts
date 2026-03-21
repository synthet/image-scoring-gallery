import { create } from 'zustand';

export interface WorkerLogEntry {
    ts: string;
    level: 'info' | 'warn' | 'error';
    source: 'pipeline' | 'worker' | 'api' | 'system';
    message: string;
}

const LOG_BUFFER_MAX = 1000;

interface RunsStore {
    queueDepth: number;
    logBuffer: WorkerLogEntry[];
    actor: string;
    activeJobId: string | number | null;

    setQueueDepth: (n: number) => void;
    setActor: (actor: string) => void;
    setActiveJobId: (id: string | number | null) => void;
    appendLog: (entry: WorkerLogEntry) => void;
    clearLog: () => void;
    reset: () => void;
}

export const useRunsStore = create<RunsStore>((set) => ({
    queueDepth: 0,
    logBuffer: [],
    actor: '',
    activeJobId: null,

    setQueueDepth: (n) => set({ queueDepth: n }),
    setActor: (actor) => set({ actor }),
    setActiveJobId: (id) => set({ activeJobId: id, logBuffer: [] }),

    appendLog: (entry) =>
        set((state) => {
            const next = [...state.logBuffer, entry];
            return {
                logBuffer: next.length > LOG_BUFFER_MAX ? next.slice(next.length - LOG_BUFFER_MAX) : next,
            };
        }),

    clearLog: () => set({ logBuffer: [] }),

    reset: () =>
        set({
            queueDepth: 0,
            logBuffer: [],
            actor: '',
            activeJobId: null,
        }),
}));
