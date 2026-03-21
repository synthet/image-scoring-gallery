import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './apiClient';



// Private internals we access for testing
interface ApiClientInternals {
  reconnectAttempts: number;
  ws: WebSocket | null;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  connect: () => void;
  scheduleReconnect: () => void;
  getReconnectDelay: () => number;
  disconnect: () => void;
  on: (type: string, cb: (data: unknown) => void) => void;
  off: (type: string, cb: (data: unknown) => void) => void;
}

let mockWs: {
  url: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: Event) => void) | null;
  close: ReturnType<typeof vi.fn>;
  _triggerOpen: () => void;
  _triggerMessage: (obj: { type: string; data: unknown }) => void;
};

function createMockWs() {
  return {
    url: '',
    readyState: 0,
    onopen: null as (() => void) | null,
    onmessage: null as ((e: MessageEvent) => void) | null,
    onclose: null as (() => void) | null,
    onerror: null as ((e: Event) => void) | null,
    close: vi.fn(),
    _triggerOpen() {
      this.readyState = 1;
      this.onopen?.();
    },
    _triggerMessage(obj: { type: string; data: unknown }) {
      const event = new MessageEvent('message', { data: JSON.stringify(obj) });
      this.onmessage?.(event);
    },
  };
}

describe('ApiClient', () => {
  beforeEach(() => {
    mockWs = createMockWs();

    const MockWebSocket = class {
      constructor(url: string) {
        mockWs.url = url;
        mockWs.readyState = 0;
        return mockWs;
      }
    } as unknown as new (url: string) => WebSocket;

    vi.stubGlobal('WebSocket', MockWebSocket);

    (globalThis.window as any).electron = {
      getApiPort: vi.fn().mockResolvedValue(7860),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis.window as any).electron = undefined;
    vi.useRealTimers();
  });

  it('connects to the default port when no electron api', async () => {
    (globalThis.window as any).electron = undefined;
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockWs.url).toBe('ws://127.0.0.1:7860/ws/updates');
    client.disconnect();
  });

  it('uses the port returned by getApiPort', async () => {
    (globalThis.window as any).electron.getApiPort = vi.fn().mockResolvedValue(9000);
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockWs.url).toContain(':9000/');
    client.disconnect();
  });

  it('falls back to default port when getApiPort rejects', async () => {
    (globalThis.window as any).electron.getApiPort = vi.fn().mockRejectedValue(new Error('fail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockWs.url).toBe('ws://127.0.0.1:7860/ws/updates');
    client.disconnect();
    consoleSpy.mockRestore();
  });

  it('resets reconnectAttempts to 0 on successful connection', async () => {
    const client = new ApiClient() as unknown as ApiClientInternals;
    await new Promise(resolve => setTimeout(resolve, 0));
    client.reconnectAttempts = 5;
    mockWs._triggerOpen();
    expect(client.reconnectAttempts).toBe(0);
    client.disconnect();
  });

  it('on() and off() register and unregister handlers', async () => {
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    mockWs._triggerOpen();

    const handler = vi.fn();
    client.on('test_event', handler);
    mockWs._triggerMessage({ type: 'test_event', data: { x: 42 } });
    expect(handler).toHaveBeenCalledWith({ x: 42 });

    client.off('test_event', handler);
    handler.mockClear();
    mockWs._triggerMessage({ type: 'test_event', data: { x: 99 } });
    expect(handler).not.toHaveBeenCalled();

    client.disconnect();
  });

  it('dispatches to correct handler by event type', async () => {
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    mockWs._triggerOpen();

    const handlerA = vi.fn();
    const handlerB = vi.fn();
    client.on('typeA', handlerA);
    client.on('typeB', handlerB);

    mockWs._triggerMessage({ type: 'typeA', data: 'a' });
    expect(handlerA).toHaveBeenCalledWith('a');
    expect(handlerB).not.toHaveBeenCalled();

    mockWs._triggerMessage({ type: 'typeB', data: 'b' });
    expect(handlerB).toHaveBeenCalledWith('b');

    client.disconnect();
  });

  it('handles malformed JSON in onmessage without throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    mockWs._triggerOpen();

    expect(() =>
      mockWs.onmessage?.(new MessageEvent('message', { data: 'not-json' }))
    ).not.toThrow();

    consoleSpy.mockRestore();
    client.disconnect();
  });

  it('disconnect closes the WebSocket', async () => {
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    client.disconnect();
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('schedules a reconnect when the socket closes', async () => {
    vi.useFakeTimers();
    const client = new ApiClient();
    await vi.runAllTimersAsync();
    mockWs._triggerOpen();

    mockWs.onclose?.();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    client.disconnect();
  });

  it('stops connecting after max reconnection attempts', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new ApiClient() as unknown as ApiClientInternals;
    await new Promise(resolve => setTimeout(resolve, 0));

    client.reconnectAttempts = 50;
    client.connect();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max reconnection attempts reached')
    );

    consoleSpy.mockRestore();
    client.disconnect();
  });

  it('getReconnectDelay returns increasing values with jitter', async () => {
    const client = new ApiClient() as unknown as ApiClientInternals;
    await new Promise(resolve => setTimeout(resolve, 0));

    client.reconnectAttempts = 0;
    const delay0 = client.getReconnectDelay();
    expect(delay0).toBeGreaterThanOrEqual(800);
    expect(delay0).toBeLessThanOrEqual(1200);

    client.reconnectAttempts = 1;
    const delay1 = client.getReconnectDelay();
    expect(delay1).toBeGreaterThanOrEqual(1600);
    expect(delay1).toBeLessThanOrEqual(2400);

    // Capped at maxReconnectInterval (30s ±20%)
    client.reconnectAttempts = 20;
    const delayMax = client.getReconnectDelay();
    expect(delayMax).toBeLessThanOrEqual(36000);

    client.disconnect();
  });

  it('multiple handlers for same event type all get called', async () => {
    const client = new ApiClient();
    await new Promise(resolve => setTimeout(resolve, 0));
    mockWs._triggerOpen();

    const h1 = vi.fn();
    const h2 = vi.fn();
    client.on('multi', h1);
    client.on('multi', h2);

    mockWs._triggerMessage({ type: 'multi', data: 'x' });
    expect(h1).toHaveBeenCalledWith('x');
    expect(h2).toHaveBeenCalledWith('x');

    client.disconnect();
  });
});
