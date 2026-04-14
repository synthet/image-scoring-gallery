import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../store/useNotificationStore';
import { useJobProgressStore } from '../store/useJobProgressStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { bridge } from '../bridge';
import { BACKEND_JOB_TYPE_LABEL } from '../constants/pipelineLabels';

interface UseGalleryWebSocketParams {
  refreshImages: (opts?: { preserveItems?: boolean }) => void;
  refreshStacks: (opts?: { preserveItems?: boolean }) => void;
  refreshFolders: () => void;
  loadStackImages: (stackId: number) => Promise<void>;
  stacksModeRef: React.MutableRefObject<boolean>;
  activeStackIdRef: React.MutableRefObject<number | null>;
  onVisibleRefresh?: () => void;
}

/**
 * Subscribes to the WebSocket service and dispatches real-time backend events
 * to the appropriate gallery refresh callbacks.
 *
 * Uses debounced (500 ms) refresh scheduling to coalesce rapid bursts of events.
 */
export function useGalleryWebSocket({
  refreshImages,
  refreshStacks,
  refreshFolders,
  loadStackImages,
  stacksModeRef,
  activeStackIdRef,
  onVisibleRefresh,
}: UseGalleryWebSocketParams) {
  const addNotification = useNotificationStore(state => state.addNotification);
  const isBackendEnabled = useConnectionStore(state => state.isBackendEnabled);

  // Stable refs so WebSocket callbacks never close over stale functions
  const refreshImagesRef = useRef(refreshImages);
  refreshImagesRef.current = refreshImages;
  const refreshStacksRef = useRef(refreshStacks);
  refreshStacksRef.current = refreshStacks;
  const refreshFoldersRef = useRef(refreshFolders);
  refreshFoldersRef.current = refreshFolders;
  const loadStackImagesRef = useRef(loadStackImages);
  loadStackImagesRef.current = loadStackImages;
  const onVisibleRefreshRef = useRef(onVisibleRefresh);
  onVisibleRefreshRef.current = onVisibleRefresh;

  useEffect(() => {
    // If backend is manually disabled, do nothing.
    if (!isBackendEnabled) {
      return;
    }

    type WebSocketClient = {
      connect: () => Promise<void> | void;
      disconnect: () => void;
      on: (type: string, handler: (data: unknown) => void) => void;
      off: (type: string, handler: (data: unknown) => void) => void;
    };

    let cancelled = false;
    let ws: WebSocketClient | null = null;
    let imageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let folderRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const subscriptions: Array<{ type: string; handler: (data: unknown) => void }> = [];

    const scheduleVisibleRefresh = () => {
      if (imageRefreshTimer) return;
      imageRefreshTimer = setTimeout(() => {
        imageRefreshTimer = null;

        if (activeStackIdRef.current !== null) {
          void loadStackImagesRef.current(activeStackIdRef.current);
          onVisibleRefreshRef.current?.();
          return;
        }

        if (stacksModeRef.current) {
          refreshStacksRef.current({ preserveItems: true });
          onVisibleRefreshRef.current?.();
          return;
        }

        refreshImagesRef.current({ preserveItems: true });
        onVisibleRefreshRef.current?.();
      }, 500);
    };

    const scheduleFolderRefresh = () => {
      if (folderRefreshTimer) return;
      folderRefreshTimer = setTimeout(() => {
        folderRefreshTimer = null;
        refreshFoldersRef.current();
      }, 500);
    };

    import('../services/WebSocketService').then(({ webSocketService }) => {
      if (cancelled) return;

      ws = webSocketService;
      void ws.connect();

      const subscribe = (type: string, handler: (data: unknown) => void) => {
        ws?.on(type, handler);
        subscriptions.push({ type, handler });
      };

      subscribe('stack_created', (data: unknown) => {
        const d = data as { summary?: string };
        console.log('[App] Received stack_created event:', d);
        addNotification(`New stack created: ${d.summary || 'Summary not available'}`, 'success');
        bridge.rebuildStackCache().then(() => {
          console.log('[App] Stack cache rebuilt due to external event.');
          scheduleVisibleRefresh();
        });
      });

      subscribe('folder_discovered', (data: unknown) => {
        const d = data as { path: string };
        console.log('[App] Folder discovered:', d.path);
        addNotification(`Discovered folder: ${d.path.split(/[\\/]/).pop()}`, 'info');
      });

      subscribe('image_discovered', () => {
        // Silent for individual images to avoid spam, but could use for status bar
      });

      subscribe('image_scored', (data: unknown) => {
        const d = data as { file_path: string };
        console.log('[App] Image scored:', d.file_path);
      });

      subscribe('image_updated', () => {
        scheduleVisibleRefresh();
        scheduleFolderRefresh();
      });

      subscribe('folder_updated', () => {
        scheduleFolderRefresh();
      });

      subscribe('job_started', (data: unknown) => {
        const d = data as { job_type: string; job_id: string };
        console.log('[App] Job started:', d);
        const typeLabel = BACKEND_JOB_TYPE_LABEL[d.job_type] ?? 'Process';
        addNotification(`${typeLabel} run started (#${d.job_id})`, 'info');
        useJobProgressStore.getState().startJob(String(d.job_id), d.job_type);
      });

      subscribe('job_progress', (data: unknown) => {
        const d = data as {
          job_id: string | number;
          current: number;
          total: number;
          message?: string;
          job_type?: string;
        };
        useJobProgressStore.getState().updateProgress(
          String(d.job_id),
          d.current,
          d.total,
          d.message,
          d.job_type,
        );
      });

      subscribe('job_completed', (data: unknown) => {
        const d = data as { status: string; job_id: string };
        console.log('[App] Job completed:', d);
        const status = d.status === 'completed' ? 'finished successfully' : 'failed';
        const type = d.status === 'completed' ? 'success' : 'error';
        addNotification(`Run ${d.job_id} ${status}`, type);
        useJobProgressStore.getState().completeJob(String(d.job_id));

        if (d.status === 'completed') {
          bridge.rebuildStackCache().then(() => {
            console.log('[App] Stack cache rebuilt after job completion.');
            scheduleVisibleRefresh();
            scheduleFolderRefresh();
          });
        }
      });

    }).catch(err => {
      console.error('[App] Failed to initialize WebSocket service:', err);
    });

    return () => {
      cancelled = true;
      subscriptions.forEach(({ type, handler }) => {
        ws?.off(type, handler);
      });
      if (imageRefreshTimer) clearTimeout(imageRefreshTimer);
      if (folderRefreshTimer) clearTimeout(folderRefreshTimer);
      if (ws) ws.disconnect();
    };
  }, [addNotification, isBackendEnabled, activeStackIdRef, loadStackImagesRef, onVisibleRefreshRef, refreshFoldersRef, refreshImagesRef, refreshStacksRef, stacksModeRef]);
}
