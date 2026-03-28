import { useEffect, useCallback, useState, useRef } from 'react';
import { useRunsStore } from '../../store/useRunsStore';
import { RunsConsole } from './RunsConsole';
import { useNotificationStore } from '../../store/useNotificationStore';
import { FolderTree } from '../Tree/FolderTree';
import type { Folder } from '../Tree/treeUtils';
import type { BackendJobInfo } from '../../electron.d';
import { bridge } from '../../bridge';

interface RunsPageProps {
    folders: Folder[];
    foldersLoading: boolean;
    onRefreshFolders: () => void;
    onBackToGallery: () => void;
}

export function RunsPage({ folders, foldersLoading, onRefreshFolders, onBackToGallery }: RunsPageProps) {
    const { activeJobId, setActiveJobId, logBuffer, appendLog, clearLog, setQueueDepth, queueDepth } = useRunsStore();
    const addNotification = useNotificationStore(s => s.addNotification);

    const [recentJobs, setRecentJobs] = useState<BackendJobInfo[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    
    // Create Run state
    const [createTarget, setCreateTarget] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    const [createOperations, setCreateOperations] = useState({
        indexing: true,
        metadata: true,
        score: true,
        tag: true,
        cluster: true,
    });

    // ── Polling backend for recent jobs ─────────────────────────
    const fetchJobs = useCallback(async () => {
        try {
            const jobs = await bridge.api.getRecentJobs();
            setRecentJobs(jobs);

            try {
                const queue = await bridge.api.getJobsQueue();
                setQueueDepth(queue.queue_depth ?? 0);
            } catch { /* ignore */ }
        } catch (e) {
            console.error('Failed to fetch recent jobs:', e);
        }
    }, [setQueueDepth]);

    useEffect(() => {
        setJobsLoading(true);
        fetchJobs().finally(() => setJobsLoading(false));
        const poll = setInterval(fetchJobs, 5000);
        return () => clearInterval(poll);
    }, [fetchJobs]);

    // ── WebSocket event subscription for active logs ────────────
    const appendLogRef = useRef(appendLog);
    appendLogRef.current = appendLog;
    const activeJobIdRef = useRef(activeJobId);
    activeJobIdRef.current = activeJobId;

    useEffect(() => {
        let unsubFns: Array<() => void> = [];

        import('../../services/WebSocketService').then(({ webSocketService: ws }) => {
            const onStarted = (data: unknown) => {
                const d = data as { job_id: string | number; job_type?: string };
                if (String(activeJobIdRef.current) === String(d.job_id)) {
                    appendLogRef.current({ ts: new Date().toISOString(), level: 'info', source: 'pipeline', message: `Job started: ${d.job_type ?? 'unknown'}` });
                }
                fetchJobs(); // Refresh jobs list
            };

            const onProgress = (data: unknown) => {
                const d = data as { job_id: string | number; message?: string };
                // We show logs if it matches the active job
                if (String(activeJobIdRef.current) === String(d.job_id) && d.message) {
                    appendLogRef.current({ ts: new Date().toISOString(), level: 'info', source: 'worker', message: d.message });
                }
            };

            const onCompleted = (data: unknown) => {
                const d = data as { job_id: string | number; status?: string; error?: string };
                if (String(activeJobIdRef.current) === String(d.job_id)) {
                    const succeeded = d.status === 'completed';
                    appendLogRef.current({
                        ts: new Date().toISOString(),
                        level: succeeded ? 'info' : 'error',
                        source: 'pipeline',
                        message: `Job ${succeeded ? 'completed' : 'failed'}${d.error ? ` — ${d.error}` : ''}`,
                    });
                }
                fetchJobs(); // Refresh jobs list
            };

            ws.on('job_started', onStarted);
            ws.on('job_progress', onProgress);
            ws.on('job_completed', onCompleted);

            unsubFns = [
                () => ws.off('job_started', onStarted),
                () => ws.off('job_progress', onProgress),
                () => ws.off('job_completed', onCompleted),
            ];
        }).catch(() => { /* ws unavailable */ });

        return () => unsubFns.forEach((fn) => fn());
    }, [fetchJobs]);

    // Update log console if selected job has historic logs, or clear if 'new'
    useEffect(() => {
        if (!activeJobId || activeJobId === 'new') {
            clearLog();
            return;
        }

        const selected = recentJobs.find(j => String(j.job_id) === String(activeJobId));
        if (selected && selected.status !== 'running' && selected.status !== 'pending') {
            // It's historic, load its log if buffer is empty and it has a stored log
            if (logBuffer.length === 0 && selected.log) {
                // Split multi-line backend log string into visual entries
                const lines = selected.log.split('\n').filter((l: string) => l.trim().length > 0);
                for (const line of lines) {
                    appendLog({ ts: selected.completed_at || new Date().toISOString(), level: 'info', source: 'system', message: line });
                }
            } else if (logBuffer.length === 0 && !selected.log) {
                 appendLog({ ts: new Date().toISOString(), level: 'warn', source: 'system', message: 'No logs available for this job.' });
            }
        }
    }, [activeJobId, recentJobs, logBuffer.length, appendLog, clearLog]);


    const handleSelectJob = (id: string | number) => {
        if (String(activeJobId) !== String(id)) {
            setActiveJobId(id);
        }
    };

    const handleCreateNew = () => {
        setActiveJobId('new');
    };

    const handleSubmitNewJob = async () => {
        if (!createTarget || createBusy) return;
        setCreateBusy(true);
        try {
            const operations = Object.entries(createOperations)
                .filter(([_, enabled]) => enabled)
                .map(([key]) => key);
            
            if (operations.length === 0) {
                addNotification('Select at least one phase to run.', 'warning');
                return;
            }

            const res = await bridge.api.submitPipeline({
                input_path: createTarget,
                operations,
                skip_existing: true,
            });

            addNotification('Job queued successfully', 'success');
            // Assuming res.data.job_id is returned
            if (res.data && res.data.job_id) {
                setActiveJobId(String(res.data.job_id));
            }
            fetchJobs();
        } catch (e) {
            addNotification(`Submit failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setCreateBusy(false);
        }
    };

    const handleStopAll = async () => {
        if (!confirm('Are you sure you want to stop all running jobs?')) return;
        try {
            await Promise.allSettled([
                bridge.api.stopScoring(),
                bridge.api.stopTagging(),
                bridge.api.stopClustering(),
            ]);
            addNotification('Stop signal sent to all runners.', 'info');
        } catch (e) {
            addNotification(`Stop failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
    };

    const activeJob = activeJobId !== 'new' ? recentJobs.find(j => String(j.job_id) === String(activeJobId)) : null;

    // Map createTarget path -> folder id for FolderTree
    const flattenFolders = (f: Folder): Folder[] => [f, ...(f.children || []).flatMap(flattenFolders)];
    const selectedFolderByPath = folders.flatMap(flattenFolders).find((f) => f.path === createTarget);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #333', background: '#141414' }}>
                <button onClick={onBackToGallery} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.85em', marginRight: 15 }}>
                    ← Gallery
                </button>
                <div style={{ fontSize: '1.1em', fontWeight: 600 }}>Scoring...</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: '0.85em', color: '#888', marginRight: 15 }}>
                    Queue depth: {queueDepth}
                </div>
                <button onClick={handleStopAll} style={{ background: '#7a2020', border: 'none', color: '#eee', borderRadius: 4, padding: '5px 12px', fontSize: '0.85em', cursor: 'pointer' }}>
                    Stop All Active
                </button>
            </div>

            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {/* Left Sidebar: Runs List */}
                <div style={{ width: 280, borderRight: '1px solid #333', background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: 10 }}>
                        <button
                            onClick={handleCreateNew}
                            style={{
                                width: '100%', padding: '8px 0', background: activeJobId === 'new' ? '#333' : '#2a5faa',
                                color: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                            }}
                        >
                            + New Run
                        </button>
                    </div>
                    <div style={{ padding: '0 10px', fontSize: '0.8em', color: '#666', textTransform: 'uppercase', marginBottom: 5 }}>Recent Jobs</div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {jobsLoading && recentJobs.length === 0 ? (
                            <div style={{ padding: 10, color: '#666', fontSize: '0.85em' }}>Loading jobs...</div>
                        ) : recentJobs.length === 0 ? (
                            <div style={{ padding: 10, color: '#666', fontSize: '0.85em' }}>No recent jobs found.</div>
                        ) : (
                            recentJobs.map(job => (
                                <div
                                    key={job.job_id}
                                    onClick={() => handleSelectJob(job.job_id)}
                                    style={{
                                        padding: '10px', cursor: 'pointer', borderBottom: '1px solid #222',
                                        background: String(activeJobId) === String(job.job_id) ? '#1f1f1f' : 'transparent',
                                        borderLeft: String(activeJobId) === String(job.job_id) ? '3px solid #4caf50' : '3px solid transparent',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.9em', fontWeight: 600, color: '#ccc' }}>#{job.job_id} - {job.job_type || 'Unknown'}</span>
                                        <span style={{
                                            fontSize: '0.7em', padding: '1px 4px', borderRadius: 3,
                                            background: job.status === 'completed' ? '#1b3e1d' : job.status === 'running' ? '#1b3a5a' : job.status === 'failed' ? '#4a1414' : '#333',
                                            color: job.status === 'completed' ? '#a5d6a7' : job.status === 'running' ? '#90caf9' : job.status === 'failed' ? '#ef9a9a' : '#aaa'
                                        }}>
                                            {job.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75em', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {((job as any).input_path ?? '').split(/[/\\]/).pop() || (job as any).input_path || 'No target'}
                                    </div>
                                    <div style={{ fontSize: '0.7em', color: '#555', marginTop: 4 }}>
                                        {new Date(job.created_at || '').toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#111' }}>
                    {!activeJobId ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                            Select a job to view details, or create a new run.
                        </div>
                    ) : activeJobId === 'new' ? (
                        <>
                            <div style={{ padding: 20 }}>
                                <h2 style={{ marginTop: 0, marginBottom: 5 }}>Create New Run</h2>
                                <div style={{ color: '#888', fontSize: '0.9em', marginBottom: 20 }}>Configure and submit a new backend processing pipeline.</div>
                                
                                <div style={{ display: 'flex', gap: 20, minHeight: 300, maxHeight: 500 }}>
                                    {/* Left half: Folder selection */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #333', borderRadius: 4, background: '#1a1a1a' }}>
                                        <div style={{ padding: '8px 12px', background: '#222', borderBottom: '1px solid #333', fontSize: '0.85em', fontWeight: 600 }}>1. Select Target Folder</div>
                                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                                            {foldersLoading ? (
                                                <div style={{ color: '#666', padding: '8px 14px', fontSize: '0.85em' }}>Loading folders…</div>
                                            ) : (
                                                <FolderTree
                                                    folders={folders}
                                                    onSelect={(f) => setCreateTarget(f.path)}
                                                    selectedId={selectedFolderByPath?.id}
                                                    onRefresh={onRefreshFolders}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Right half: Options */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #333', borderRadius: 4, background: '#1a1a1a' }}>
                                        <div style={{ padding: '8px 12px', background: '#222', borderBottom: '1px solid #333', fontSize: '0.85em', fontWeight: 600 }}>2. Configure Operations</div>
                                        <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {(['indexing', 'metadata', 'score', 'tag', 'cluster'] as const).map(op => (
                                                <label key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={createOperations[op]} 
                                                        onChange={(e) => setCreateOperations({...createOperations, [op]: e.target.checked})} 
                                                    />
                                                    <span style={{ fontSize: '0.9em', color: '#ccc', textTransform: 'capitalize' }}>
                                                        {op === 'score' ? 'Scoring' : op === 'tag' ? 'Tagging' : op === 'cluster' ? 'Clustering' : op}
                                                    </span>
                                                </label>
                                            ))}

                                            <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                                                <button
                                                    onClick={handleSubmitNewJob}
                                                    disabled={!createTarget || createBusy}
                                                    style={{
                                                        width: '100%', padding: '10px',
                                                        background: !createTarget || createBusy ? '#333' : '#4caf50',
                                                        color: !createTarget || createBusy ? '#777' : '#fff',
                                                        border: 'none', borderRadius: 4, fontWeight: 'bold',
                                                        cursor: !createTarget || createBusy ? 'not-allowed' : 'pointer',
                                                    }}
                                                >
                                                    {createBusy ? 'Submitting...' : 'Submit Job'}
                                                </button>
                                                {!createTarget && <div style={{ textAlign: 'center', fontSize: '0.8em', color: '#f44336', marginTop: 8 }}>Please select a target folder first.</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : activeJob ? (
                        <>
                            {/* Job Details Header */}
                            <div style={{ padding: '15px 20px', borderBottom: '1px solid #2a2a2a', background: '#1a1a1a' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.2em', color: '#eee' }}>Job #{activeJob.job_id} ({activeJob.job_type})</h2>
                                        <div style={{ fontSize: '0.85em', color: '#888', marginTop: 4 }}>Target: {activeJob.input_path || 'None'}</div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.85em', padding: '4px 8px', borderRadius: 4, fontWeight: 600,
                                        background: activeJob.status === 'completed' ? '#1b3e1d' : activeJob.status === 'running' ? '#1b3a5a' : activeJob.status === 'failed' ? '#4a1414' : '#333',
                                        color: activeJob.status === 'completed' ? '#a5d6a7' : activeJob.status === 'running' ? '#90caf9' : activeJob.status === 'failed' ? '#ef9a9a' : '#aaa'
                                    }}>
                                        {activeJob.status.toUpperCase()}
                                    </span>
                                </div>

                                {activeJob.progress && (
                                    <div style={{ background: '#222', borderRadius: 4, height: 6, overflow: 'hidden', marginTop: 15, marginBottom: 5 }}>
                                        <div style={{ 
                                            background: activeJob.status === 'failed' ? '#f44336' : '#2196f3', 
                                            height: '100%', 
                                            width: `${Math.min(100, (activeJob.progress.current / (activeJob.progress.total || 1)) * 100)}%`,
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                )}
                                {activeJob.progress && (
                                    <div style={{ fontSize: '0.8em', color: '#666', textAlign: 'right' }}>
                                        {activeJob.progress.current} / {activeJob.progress.total} items
                                    </div>
                                )}
                            </div>

                            {/* Job Console */}
                            <div style={{ flex: 1, minHeight: 0 }}>
                                <RunsConsole entries={logBuffer} onClear={clearLog} />
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                            Job details not found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
