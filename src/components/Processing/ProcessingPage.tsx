import { useEffect, useCallback, useRef } from 'react';
import { FolderTree } from '../Tree/FolderTree';
import type { Folder } from '../Tree/treeUtils';
import { ProcessingControls } from './ProcessingControls';
import { ProcessingPhaseCard } from './ProcessingPhaseCard';
import { ProcessingConsole } from './ProcessingConsole';
import {
    useProcessingStore,
    PHASE_CODE_MAP,
    ALL_PHASES,
} from '../../store/useProcessingStore';

interface ProcessingPageProps {
    folders: Folder[];
    foldersLoading: boolean;
    onRefreshFolders: () => void;
    onBackToGallery: () => void;
}

export function ProcessingPage({
    folders,
    foldersLoading,
    onRefreshFolders,
    onBackToGallery,
}: ProcessingPageProps) {
    const folderPath = useProcessingStore(s => s.folderPath);
    const phases = useProcessingStore(s => s.phases);
    const logBuffer = useProcessingStore(s => s.logBuffer);
    const actor = useProcessingStore(s => s.actor);
    const setFolder = useProcessingStore(s => s.setFolder);
    const updatePhase = useProcessingStore(s => s.updatePhase);
    const appendLog = useProcessingStore(s => s.appendLog);
    const clearLog = useProcessingStore(s => s.clearLog);
    const setQueueDepth = useProcessingStore(s => s.setQueueDepth);

    // ── Hydrate initial status from API ───────────────────────────────────────

    const hydrateStatus = useCallback(async () => {
        try {
            const status = await window.electron.api.getAllStatus();

            // Update phases based on runner states
            const runnerMap: Record<string, typeof status.scoring> = {
                scoring: status.scoring,
                tagging: status.tagging,
            };

            for (const [runnerName, runner] of Object.entries(runnerMap)) {
                const phaseKey = runnerName === 'scoring' ? PHASE_CODE_MAP['score']
                    : runnerName === 'tagging' ? PHASE_CODE_MAP['tag']
                        : undefined;
                if (!phaseKey) continue;

                if (runner.is_running) {
                    updatePhase(phaseKey, {
                        status: 'running',
                        processed: runner.progress?.current ?? 0,
                        total: runner.progress?.total ?? 0,
                        canRun: false,
                        canSkip: true,
                        canRetry: false,
                    });
                }
            }

            // Queue depth
            try {
                const queue = await window.electron.api.getJobsQueue();
                setQueueDepth(queue.queue_depth ?? 0);
            } catch {
                // non-critical
            }
        } catch {
            // Backend not available yet; phases remain at default
        }
    }, [updatePhase, setQueueDepth]);

    useEffect(() => {
        hydrateStatus();
        const poll = setInterval(hydrateStatus, 10_000);
        return () => clearInterval(poll);
    }, [hydrateStatus]);

    // ── WebSocket event subscription ──────────────────────────────────────────

    const appendLogRef = useRef(appendLog);
    appendLogRef.current = appendLog;
    const updatePhaseRef = useRef(updatePhase);
    updatePhaseRef.current = updatePhase;
    // Track job_id → job_type: job_progress events don't include job_type
    const jobTypeMapRef = useRef<Record<string, string>>({});

    useEffect(() => {
        let unsubFns: Array<() => void> = [];

        import('../../services/WebSocketService').then(({ webSocketService: ws }) => {
            const onStarted = (data: unknown) => {
                const d = data as { job_id: string; job_type?: string; input_path?: string };
                if (d.job_type) jobTypeMapRef.current[String(d.job_id)] = d.job_type;
                appendLogRef.current({
                    ts: new Date().toISOString(), level: 'info', source: 'pipeline',
                    message: `Job started: ${d.job_type ?? 'unknown'} (id: ${d.job_id})`,
                });
                const phaseKey = d.job_type ? PHASE_CODE_MAP[d.job_type] : undefined;
                if (phaseKey) {
                    updatePhaseRef.current(phaseKey, {
                        status: 'running', canRun: false, canSkip: true, canRetry: false,
                        startedAt: new Date().toISOString(),
                    });
                }
            };

            const onProgress = (data: unknown) => {
                const d = data as { job_id: string | number; current?: number; total?: number; message?: string };
                const jobType = jobTypeMapRef.current[String(d.job_id)];
                const phaseKey = jobType ? PHASE_CODE_MAP[jobType] : undefined;
                if (phaseKey) {
                    updatePhaseRef.current(phaseKey, {
                        processed: d.current ?? 0,
                        total: d.total ?? 0,
                        message: d.message,
                    });
                }
            };

            const onCompleted = (data: unknown) => {
                const d = data as { job_id: string; status?: string; error?: string };
                const jobType = jobTypeMapRef.current[String(d.job_id)];
                delete jobTypeMapRef.current[String(d.job_id)];
                const succeeded = d.status === 'completed';
                appendLogRef.current({
                    ts: new Date().toISOString(),
                    level: succeeded ? 'info' : 'error',
                    source: 'pipeline',
                    message: `Job ${succeeded ? 'completed' : 'failed'}: ${jobType ?? 'unknown'} (id: ${d.job_id})${d.error ? ` — ${d.error}` : ''}`,
                });
                const phaseKey = jobType ? PHASE_CODE_MAP[jobType] : undefined;
                if (phaseKey) {
                    updatePhaseRef.current(phaseKey, {
                        status: succeeded ? 'done' : 'failed',
                        canRun: !succeeded,
                        canSkip: !succeeded,
                        canRetry: !succeeded,
                        endedAt: new Date().toISOString(),
                    });
                }
            };

            ws.on('job_started', onStarted);
            ws.on('job_progress', onProgress);
            ws.on('job_completed', onCompleted);

            unsubFns = [
                () => ws.off('job_started', onStarted),
                () => ws.off('job_progress', onProgress),
                () => ws.off('job_completed', onCompleted),
            ];
        }).catch(() => {
            // WebSocket service not available
        });

        return () => unsubFns.forEach((fn) => fn());
    }, []);

    // ── Folder selection ──────────────────────────────────────────────────────

    // Map folder path → folder id for FolderTree's selectedId prop
    const selectedFolderByPath = folders
        .flatMap(flattenFolders)
        .find((f) => f.path === folderPath);

    const handleSelectFolder = (folder: Folder) => {
        setFolder(folder.path);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Top controls bar */}
            <ProcessingControls folderPath={folderPath} onBack={onBackToGallery} />

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                {/* Left: folder tree */}
                <div style={{
                    width: 220, flexShrink: 0, borderRight: '1px solid #2a2a2a',
                    overflowY: 'auto', padding: '10px 0',
                }}>
                    {foldersLoading ? (
                        <div style={{ color: '#666', padding: '8px 14px', fontSize: '0.85em' }}>Loading folders…</div>
                    ) : (
                        <FolderTree
                            folders={folders}
                            onSelect={handleSelectFolder}
                            selectedId={selectedFolderByPath?.id}
                            onRefresh={onRefreshFolders}
                        />
                    )}
                </div>

                {/* Right: phase cards + console */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                    {!folderPath ? (
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#555', fontSize: '0.9em',
                        }}>
                            Select a folder to get started
                        </div>
                    ) : (
                        <>
                            {/* Phase cards */}
                            <div style={{
                                padding: 14, display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 10, overflowY: 'auto', flexShrink: 0,
                            }}>
                                {ALL_PHASES.map((phaseKey) => {
                                    const phaseState = phases.find((p) => p.phase === phaseKey)!;
                                    return (
                                        <ProcessingPhaseCard
                                            key={phaseKey}
                                            phase={phaseState}
                                            folderPath={folderPath}
                                            actor={actor}
                                        />
                                    );
                                })}
                            </div>

                            {/* Log console */}
                            <div style={{
                                flex: 1, borderTop: '1px solid #2a2a2a',
                                overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0,
                            }}>
                                <ProcessingConsole entries={logBuffer} onClear={clearLog} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function flattenFolders(folder: Folder): Folder[] {
    return [folder, ...(folder.children ?? []).flatMap(flattenFolders)];
}
