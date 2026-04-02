/**
 * WebSocket client for the Python backend /ws/updates stream.
 * Connects to the backend API port and dispatches typed events.
 */

interface WebSocketMessage {
    type: string;
    data: unknown;
}

type MessageHandler = (data: unknown) => void;

export class ApiClient {
    private ws: WebSocket | null = null;
    private url = '';
    reconnectAttempts = 0;
    private maxReconnectAttempts = 50;
    private minReconnectInterval = 1000;
    private maxReconnectInterval = 30000;
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private handlers: Map<string, Set<MessageHandler>> = new Map();
    private intentionalDisconnect = false;

    constructor() {
        void this.connect();
    }

    getReconnectDelay(): number {
        const baseDelay = Math.min(
            this.minReconnectInterval * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectInterval
        );
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
        return Math.max(this.minReconnectInterval, baseDelay + jitter);
    }

    connect(): void {
        this.intentionalDisconnect = false;

        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[ApiClient] Max reconnection attempts reached');
            return;
        }

        const getPort = (): Promise<number> => {
            const electron = window.electron;
            if (electron?.getApiPort) {
                return electron.getApiPort();
            }
            return Promise.resolve(7860);
        };

        getPort()
            .catch(() => 7860)
            .then(port => {
                this.url = `ws://127.0.0.1:${port}/ws/updates`;
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    this.reconnectAttempts = 0;
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message: WebSocketMessage = JSON.parse(event.data);
                        this.dispatch(message.type, message.data);
                    } catch (e) {
                        console.error('[ApiClient] Failed to parse message:', e);
                    }
                };

                this.ws.onclose = () => {
                    if (!this.intentionalDisconnect) {
                        this.scheduleReconnect();
                    }
                };

                this.ws.onerror = () => {
                    this.ws?.close();
                };
            });
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

        this.reconnectAttempts++;
        const delay = this.getReconnectDelay();
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }

    disconnect(): void {
        this.intentionalDisconnect = true;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    on(type: string, handler: MessageHandler): void {
        if (!this.handlers.has(type)) this.handlers.set(type, new Set());
        this.handlers.get(type)!.add(handler);
    }

    off(type: string, handler: MessageHandler): void {
        this.handlers.get(type)?.delete(handler);
    }

    private dispatch(type: string, data: unknown): void {
        this.handlers.get(type)?.forEach(h => h(data));
    }
}
