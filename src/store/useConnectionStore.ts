import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ConnectionState {
  isWebSocketEnabled: boolean;
  setWebSocketEnabled: (enabled: boolean) => void;
  toggleWebSocket: () => void;
}

/**
 * Stores the user's preference for connecting to WebSockets (real-time updates).
 * Persisted in localStorage so it survives app restarts.
 */
export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      isWebSocketEnabled: true,
      setWebSocketEnabled: (enabled) => set({ isWebSocketEnabled: enabled }),
      toggleWebSocket: () => set((state) => ({ isWebSocketEnabled: !state.isWebSocketEnabled })),
    }),
    {
      name: 'connection-storage',
    }
  )
);
