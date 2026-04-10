import { create } from 'zustand';
import { Logger } from '../services/Logger';

export interface ActiveOperation {
    type: 'import' | 'sync';
    label: string;
    startedAt: number;
    current?: number;
    total?: number;
}

interface OperationState {
    activeOps: Map<string, ActiveOperation>;
    startOp: (id: string, type: ActiveOperation['type'], label: string) => void;
    updateOp: (id: string, patch: Partial<Pick<ActiveOperation, 'current' | 'total' | 'label'>>) => void;
    completeOp: (id: string) => void;
}

export const useOperationStore = create<OperationState>((set) => ({
    activeOps: new Map(),
    startOp: (id, type, label) =>
        set((state) => {
            Logger.info(`[OperationStore] startOp id=${id} type=${type} label="${label}"`);
            const next = new Map(state.activeOps);
            next.set(id, { type, label, startedAt: Date.now() });
            return { activeOps: next };
        }),
    updateOp: (id, patch) =>
        set((state) => {
            const existing = state.activeOps.get(id);
            if (!existing) return state;
            const next = new Map(state.activeOps);
            next.set(id, { ...existing, ...patch });
            return { activeOps: next };
        }),
    completeOp: (id) =>
        set((state) => {
            const op = state.activeOps.get(id);
            if (!op) return state;
            const elapsed = ((Date.now() - op.startedAt) / 1000).toFixed(1);
            Logger.info(`[OperationStore] completeOp id=${id} type=${op.type} elapsed=${elapsed}s`, {
                current: op.current,
                total: op.total,
            });
            const next = new Map(state.activeOps);
            next.delete(id);
            return { activeOps: next };
        }),
}));
