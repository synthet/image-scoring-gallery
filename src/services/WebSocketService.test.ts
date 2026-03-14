import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webSocketService } from './WebSocketService';

type TestWindow = Window & typeof globalThis & {
  electron?: {
    getApiConfig: ReturnType<typeof vi.fn>;
  };
};

interface WebSocketServiceInternals {
  reconnectAttempts: number;
  handlers: Map<string, Set<(data: unknown) => void>>;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  getReconnectDelay: () => number;
  scheduleReconnect: () => void;
}

describe('WebSocketService', () => {
  let mockWs: {
    url: string;
    readyState: number;
    onopen: (() => void) | null;
    onmessage: ((e: MessageEvent) => void) | null;
    onclose: (() => void) | null;
    onerror: ((e: Event) => void) | null;
    close: () => void;
    _triggerOpen: () => void;
    _triggerMessage: (obj: { type: string; data: unknown }) => void;
  };

  beforeEach(() => {
    mockWs = {
      url: '',
      readyState: 0, // CONNECTING
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      close: vi.fn(),
      _triggerOpen() {
        this.readyState = 1; // OPEN
        this.onopen?.();
      },
      _triggerMessage(obj: { type: string; data: unknown }) {
        const event = new MessageEvent('message', { data: JSON.stringify(obj) });
        this.onmessage?.(event);
      },
    };

    const MockWebSocket = class {
      constructor(url: string) {
        mockWs.url = url;
        mockWs.readyState = 0;
        return mockWs;
      }
    } as unknown as new (url: string) => WebSocket;
    vi.stubGlobal('WebSocket', MockWebSocket as new (url: string) => WebSocket);

    (globalThis.window as TestWindow).electron = {
      getApiConfig: vi.fn().mockResolvedValue({ url: 'http://localhost:8000' }),
    };

    // Reset singleton state
    const service = webSocketService as unknown as WebSocketServiceInternals;
    service.reconnectAttempts = 0;
    service.handlers = new Map();
    if (service.reconnectTimeout) {
      clearTimeout(service.reconnectTimeout);
      service.reconnectTimeout = null;
    }
  });

  afterEach(() => {
    webSocketService.disconnect();
    vi.unstubAllGlobals();
    delete (globalThis.window as TestWindow).electron;
  });

  it('calls getApiConfig and creates WebSocket with correct URL on connect', async () => {
    await webSocketService.connect();

    expect((globalThis.window as TestWindow).electron?.getApiConfig).toHaveBeenCalled();
    expect(mockWs.url).toBe('ws://localhost:8000/ws/updates');
  });

  it('on/off adds and removes handlers', async () => {
    const handler = vi.fn();
    webSocketService.on('job_completed', handler);

    await webSocketService.connect();
    mockWs._triggerOpen();

    mockWs._triggerMessage({ type: 'job_completed', data: { job_id: 'x', status: 'completed' } });
    expect(handler).toHaveBeenCalledWith({ job_id: 'x', status: 'completed' });

    webSocketService.off('job_completed', handler);
    handler.mockClear();
    mockWs._triggerMessage({ type: 'job_completed', data: { job_id: 'y' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches message to handlers by type', async () => {
    const jobHandler = vi.fn();
    const imageHandler = vi.fn();
    webSocketService.on('job_completed', jobHandler);
    webSocketService.on('image_scored', imageHandler);

    await webSocketService.connect();
    mockWs._triggerOpen();

    mockWs.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'job_completed', data: { x: 1 } }) }));
    expect(jobHandler).toHaveBeenCalledWith({ x: 1 });
    expect(imageHandler).not.toHaveBeenCalled();

    mockWs.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'image_scored', data: { path: '/a.jpg' } }) }));
    expect(imageHandler).toHaveBeenCalledWith({ path: '/a.jpg' });
  });

  describe('Reconnection and Error Handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calculates exponential backoff with jitter', () => {
      // Accessing private method via bracket notation for testing
      const service = webSocketService as unknown as WebSocketServiceInternals;
      service.reconnectAttempts = 0;
      let delay = service.getReconnectDelay();
      expect(delay).toBeGreaterThanOrEqual(800); // 1000 - 200 jitter
      expect(delay).toBeLessThanOrEqual(1200); // 1000 + 200 jitter

      service.reconnectAttempts = 1;
      delay = service.getReconnectDelay();
      expect(delay).toBeGreaterThanOrEqual(1600); // 2000 - 400 jitter
      expect(delay).toBeLessThanOrEqual(2400); // 2000 + 400 jitter

      service.reconnectAttempts = 10; // 2^10 * 1000 is way over 30s
      delay = service.getReconnectDelay();
      expect(delay).toBeGreaterThanOrEqual(24000); // 30000 - 6000 jitter
      expect(delay).toBeLessThanOrEqual(36000); // 30000 + 6000 jitter
    });

    it('schedules reconnect on close', async () => {
      await webSocketService.connect();
      mockWs._triggerOpen();
      
      const connectSpy = vi.spyOn(webSocketService, 'connect');
      mockWs.onclose?.();
      
      expect(vi.getTimerCount()).toBe(1);
      vi.runAllTimers();
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    it('schedules reconnect on error', async () => {
      await webSocketService.connect();
      mockWs._triggerOpen();
      
      const closeSpy = vi.spyOn(mockWs, 'close');
      mockWs.onerror?.(new Event('error'));
      
      expect(closeSpy).toHaveBeenCalled();
      // onclose will be triggered by close() in a real browser, 
      // but here we might need to trigger it manually or rely on the onerror -> close -> onclose flow
      mockWs.onclose?.(); 
      expect(vi.getTimerCount()).toBe(1);
    });

    it('stops reconnecting after max attempts', async () => {
      const service = webSocketService as unknown as WebSocketServiceInternals;
      service.reconnectAttempts = 50;
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await webSocketService.connect();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Max reconnection attempts reached'));
      
      service.scheduleReconnect();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stopping reconnect'));
      consoleSpy.mockRestore();
    });

    it('handles malformed JSON in onmessage', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await webSocketService.connect();
      mockWs._triggerOpen();

      mockWs.onmessage?.(new MessageEvent('message', { data: 'invalid json' }));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse message'), expect.anything());
      consoleSpy.mockRestore();
    });

    it('handles connection initialization failure', async () => {
      const testWindow = globalThis.window as TestWindow;
      const getApiConfig = testWindow.electron!.getApiConfig;
      testWindow.electron!.getApiConfig = vi.fn().mockRejectedValue(new Error('Config error'));
      
      const service = webSocketService as unknown as WebSocketServiceInternals;
      const scheduleSpy = vi.spyOn(service, 'scheduleReconnect');
      
      await webSocketService.connect();
      expect(scheduleSpy).toHaveBeenCalled();
      
      testWindow.electron!.getApiConfig = getApiConfig;
    });
  });
});
