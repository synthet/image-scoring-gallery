import { useDatabase } from './hooks/useDatabase';
import { useSessionRecorder } from './hooks/useSessionRecorder';
import AppContent from './AppContent';


function App() {
  useSessionRecorder();

  const { isConnected, error, retry } = useDatabase();

  if (!isConnected && !error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
      <div style={{ fontSize: '1.2em', marginBottom: 10 }}>Connecting to services...</div>
      <div style={{ fontSize: '0.85em', color: '#666' }}>Connecting to database...</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: '1.2em', color: '#ff6b6b', marginBottom: 10 }}>Connection Error</div>
      <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: 20, maxWidth: 500, margin: '0 auto 20px' }}>{error}</div>
      <button
        onClick={retry}
        style={{
          padding: '10px 24px',
          background: '#007acc',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: '0.95em'
        }}
      >
        Retry Connection
      </button>
    </div>
  );

  return <AppContent isConnected={isConnected} />;
}

export default App;
