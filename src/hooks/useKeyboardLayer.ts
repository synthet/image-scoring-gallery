import { useEffect, useRef, useCallback } from 'react';

type KeyboardLayer = 'page' | 'drawer' | 'menu' | 'modal';

const LAYER_PRIORITY: Record<KeyboardLayer, number> = {
  page: 0,
  drawer: 1,
  menu: 2,
  modal: 3,
};

interface HandlerEntry {
  id: number;
  layer: KeyboardLayer;
  handler: (e: KeyboardEvent) => boolean;
}

let nextId = 0;
const activeHandlers: Map<number, HandlerEntry> = new Map();
let globalListenerAttached = false;

function globalKeydownHandler(e: KeyboardEvent) {
  // Sort by priority descending — highest priority first
  const sorted = Array.from(activeHandlers.values()).sort(
    (a, b) => LAYER_PRIORITY[b.layer] - LAYER_PRIORITY[a.layer]
  );

  for (const entry of sorted) {
    if (entry.handler(e)) {
      return; // First handler that returns true wins
    }
  }
}

function ensureGlobalListener() {
  if (!globalListenerAttached) {
    window.addEventListener('keydown', globalKeydownHandler);
    globalListenerAttached = true;
  }
}

function cleanupGlobalListener() {
  if (activeHandlers.size === 0 && globalListenerAttached) {
    window.removeEventListener('keydown', globalKeydownHandler);
    globalListenerAttached = false;
  }
}

/**
 * Register a keyboard handler at a specific priority layer.
 * Higher-priority layers (modal > menu > drawer > page) receive events first.
 * Return `true` from the handler to consume the event and prevent lower layers from seeing it.
 *
 * @param layer - Priority layer for this handler
 * @param handler - Callback that returns true if the event was handled
 * @param active - Whether this handler is currently active (e.g., false when viewer is closed)
 */
export function useKeyboardLayer(
  layer: KeyboardLayer,
  handler: (e: KeyboardEvent) => boolean,
  active: boolean = true
) {
  const handlerRef = useRef(handler);
  const idRef = useRef<number | null>(null);

  // Keep handler ref current without re-registering
  handlerRef.current = handler;

  const stableHandler = useCallback((e: KeyboardEvent) => {
    return handlerRef.current(e);
  }, []);

  useEffect(() => {
    if (!active) {
      // Remove if was previously active
      if (idRef.current !== null) {
        activeHandlers.delete(idRef.current);
        idRef.current = null;
        cleanupGlobalListener();
      }
      return;
    }

    ensureGlobalListener();
    const id = nextId++;
    idRef.current = id;
    activeHandlers.set(id, { id, layer, handler: stableHandler });

    return () => {
      activeHandlers.delete(id);
      idRef.current = null;
      cleanupGlobalListener();
    };
  }, [layer, active, stableHandler]);
}
