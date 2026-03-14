import React from 'react';
import { useJobProgressStore } from '../../store/useJobProgressStore';

const JOB_TYPE_LABELS: Record<string, string> = {
    scoring: 'Scoring',
    tagging: 'Tagging',
    clustering: 'Clustering',
    selection: 'Selection',
    fix_db: 'Fix DB',
};

export const JobProgressBar: React.FC = () => {
    const activeJobs = useJobProgressStore((s) => s.activeJobs);
    const entries = Object.values(activeJobs);

    if (entries.length === 0) return null;

    return (
        <div style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-light)',
            padding: '4px 12px',
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
            fontSize: '0.8em',
            color: 'var(--text-secondary)',
        }}>
            {entries.map((job) => {
                const pct = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
                const label = JOB_TYPE_LABELS[job.job_type] ?? job.job_type;
                return (
                    <div key={job.job_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ flexShrink: 0 }}>{label}</span>
                        <div style={{
                            width: '120px',
                            height: '6px',
                            background: 'var(--border)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            flexShrink: 0,
                        }}>
                            <div style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: 'var(--accent)',
                                borderRadius: '3px',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                        <span style={{ flexShrink: 0 }}>
                            {job.total > 0 ? `${job.current}/${job.total}` : `${job.current}...`}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};
