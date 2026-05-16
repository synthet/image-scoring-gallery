import { useEffect, useRef, useState } from 'react';
import { useDatabase } from './hooks/useDatabase';
import { useSessionRecorder } from './hooks/useSessionRecorder';
import AppContent from './AppContent';
import { AppModeProvider, useAppMode } from './context/AppModeContext';
import { FsGallery } from './components/FsMode/FsGallery';
import { bridge } from './bridge';
import styles from './components/FsMode/FsGallery.module.css';
import { XCircle } from 'lucide-react';
import { Logger } from './services/Logger';

function AppShell() {
  useSessionRecorder();
  const { mode, setMode, enterFolderMode } = useAppMode();
  const { isConnected, error, retry } = useDatabase();
  const [folderModeBlockedHint, setFolderModeBlockedHint] = useState<string | null>(null);
  const hasConnectedOnce = useRef(false);
  const prevConnected = useRef<boolean | null>(null);

  useEffect(() => {
    return bridge.onAppModeChanged((m) => setMode(m));
  }, [setMode]);

  // Log only on real transitions (avoids strict-mode double logs and repeated "restored" spam)
  useEffect(() => {
    const was = prevConnected.current;
    if (isConnected && !hasConnectedOnce.current) {
      Logger.info('[AppShell] First DB connection established — latching hasConnectedOnce');
      hasConnectedOnce.current = true;
    } else if (isConnected && was === false && hasConnectedOnce.current) {
      Logger.info('[AppShell] DB connection restored after transient disconnect');
    } else if (!isConnected && hasConnectedOnce.current) {
      Logger.warn('[AppShell] DB connection lost after initial connect — AppContent stays mounted', { error });
    } else if (!isConnected && !hasConnectedOnce.current && error) {
      Logger.warn('[AppShell] DB connection failed on startup', { error });
    }
    prevConnected.current = isConnected;
  }, [isConnected, error]);

  if (mode === 'folder') {
    return <FsGallery />;
  }

  // Before first successful connection: show connecting / error screens
  if (!hasConnectedOnce.current) {
    if (!isConnected && !error) return (
      <div className={styles.connectingScreen}>
        <div className={styles.connectingSpinner} />
        <div className={styles.connectingTitle}>Connecting to services…</div>
        <div className={styles.connectingSubtitle}>Establishing database connection</div>
      </div>
    );

    if (error) return (
      <div className={styles.errorScreen}>
        <div className={styles.errorIcon}>
          <XCircle size={28} color="var(--color-danger)" />
        </div>
        <div className={styles.errorTitle}>Connection Error</div>
        <div className={styles.errorMessage}>{error}</div>
        <div className={styles.errorActions}>
          <button
            type="button"
            onClick={() => {
              setFolderModeBlockedHint(null);
              void enterFolderMode().then((ok) => {
                if (!ok) {
                  setFolderModeBlockedHint(
                    'Folder mode needs the desktop Electron app. A browser-only dev session (e.g. localhost:5173) cannot read your disk.',
                  );
                }
              });
            }}
            className={styles.folderModeButton}
          >
            Enter Folder Mode
          </button>
          <button
            type="button"
            onClick={retry}
            className={styles.retryButton}
          >
            Retry Connection
          </button>
        </div>
        <p className={styles.errorHint}>
          Folder Mode is read-only: browse images under your configured root,
          view EXIF metadata, and preview RAW files. Ratings and keywords are
          not persisted in this mode.
        </p>
        {folderModeBlockedHint && (
          <p className={styles.errorMessage} style={{ marginTop: 16, maxWidth: 420, textAlign: 'center' }}>
            {folderModeBlockedHint}
          </p>
        )}
      </div>
    );
  }

  // After first connection: keep AppContent mounted, show inline banner on disconnect
  return (
    <>
      {hasConnectedOnce.current && !isConnected && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#b71c1c', color: '#fff', textAlign: 'center',
          padding: '6px 12px', fontSize: '0.85em', fontWeight: 500,
        }}>
          Connection lost — retrying…
        </div>
      )}
      <AppContent />
    </>
  );
}

function App() {
  return (
    <AppModeProvider>
      <AppShell />
    </AppModeProvider>
  );
}

export default App;
