import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ConnectionState {
  isBackendEnabled: boolean;
  setBackendEnabled: (enabled: boolean) => void;
  toggleBackend: () => void;
}

/**
 * Stores the user's preference for connecting to the Python backend/WebSockets.
 * Persisted in localStorage so it survives app restarts.
 */
export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      isBackendEnabled: true,
      setBackendEnabled: (enabled) => set({ isBackendEnabled: enabled }),
      toggleBackend: () => set((state) => ({ isBackendEnabled: !state.isBackendEnabled })),
    }),
    {
      name: 'connection-storage',
    }
  )
);
