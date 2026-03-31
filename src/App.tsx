import { useEffect } from 'react';
import { useDatabase } from './hooks/useDatabase';
import { useSessionRecorder } from './hooks/useSessionRecorder';
import AppContent from './AppContent';
import { AppModeProvider, useAppMode } from './context/AppModeContext';
import { FsGallery } from './components/FsMode/FsGallery';
import { bridge } from './bridge';

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
    <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
      <div style={{ fontSize: '1.2em', marginBottom: 10 }}>Connecting to services...</div>
      <div style={{ fontSize: '0.85em', color: '#666' }}>Connecting to database...</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: '1.2em', color: '#ff6b6b', marginBottom: 10 }}>Connection Error</div>
      <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: 20, maxWidth: 520, margin: '0 auto 20px' }}>{error}</div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void enterFolderMode()}
          style={{
            padding: '10px 24px',
            background: '#2e7d32',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.95em',
            fontWeight: 600,
          }}
        >
          Enter Folder Mode (filesystem only)
        </button>
        <button
          type="button"
          onClick={retry}
          style={{
            padding: '10px 24px',
            background: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.95em',
          }}
        >
          Retry Connection
        </button>
      </div>
      <p style={{ marginTop: 24, fontSize: '0.8em', color: '#666', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
        Folder mode is read-only: browse images under your configured root, view EXIF, and use RAW previews. It does not write ratings or keywords to sidecars.
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
