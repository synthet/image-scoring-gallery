import { useEffect } from 'react';
import { useDatabase } from './hooks/useDatabase';
import { useSessionRecorder } from './hooks/useSessionRecorder';
import AppContent from './AppContent';
import { AppModeProvider, useAppMode } from './context/AppModeContext';
import { FsGallery } from './components/FsMode/FsGallery';
import { bridge } from './bridge';
import styles from './components/FsMode/FsGallery.module.css';
import { AlertCircle } from 'lucide-react';

function AppShell() {
  useSessionRecorder();
  const { mode, setMode, enterFolderMode } = useAppMode();
  const { isConnected, error, retry } = useDatabase();

  useEffect(() => {
    return bridge.onAppModeChanged((m) => setMode(m));
  }, [setMode]);

  if (mode === 'folder') {
    return <FsGallery />;
  }

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
        <AlertCircle size={28} color="#ef5350" />
      </div>
      <div className={styles.errorTitle}>Connection Error</div>
      <div className={styles.errorMessage}>{error}</div>
      <div className={styles.errorActions}>
        <button
          type="button"
          onClick={() => void enterFolderMode()}
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
    </div>
  );

  return <AppContent />;
}

function App() {
  return (
    <AppModeProvider>
      <AppShell />
    </AppModeProvider>
  );
}

export default App;
