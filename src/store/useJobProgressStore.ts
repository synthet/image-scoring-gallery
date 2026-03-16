import { create } from 'zustand';

export interface JobProgress {
    job_id: string;
    job_type: string;
    current: number;
    total: number;
    message?: string;
    started_at: number;
}

interface JobProgressState {
    activeJobs: Record<string, JobProgress>;
    startJob: (job_id: string, job_type: string) => void;
    updateProgress: (job_id: string, current: number, total: number, message?: string) => void;
    completeJob: (job_id: string) => void;
}

export const useJobProgressStore = create<JobProgressState>((set) => ({
    activeJobs: {},
    startJob: (job_id, job_type) =>
        set((state) => ({
            activeJobs: {
                ...state.activeJobs,
                [job_id]: { job_id, job_type, current: 0, total: 0, started_at: Date.now() },
            },
        })),
    updateProgress: (job_id, current, total, message) =>
        set((state) => {
            const existing = state.activeJobs[job_id];
            return {
                activeJobs: {
                    ...state.activeJobs,
                    [job_id]: {
                        job_id,
                        job_type: existing?.job_type ?? 'unknown',
                        current,
                        total,
                        message,
                        started_at: existing?.started_at ?? Date.now(),
                    },
                },
            };
        }),
    completeJob: (job_id) =>
        set((state) => {
            const { [job_id]: _removedJob, ...rest } = state.activeJobs;
            void _removedJob;
            return { activeJobs: rest };
        }),
}));
