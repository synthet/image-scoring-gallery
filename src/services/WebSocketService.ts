import { bridge } from '../bridge';

interface WebSocketMessage {
    type: string;
    data: unknown;
}

type MessageHandler = (data: unknown) => void;

/**
 * WebSocket event types broadcast by the Python backend (/ws/updates).
 * Subscribe via webSocketService.on(type, handler).
 *
 * Job events:
 *   job_started   - { job_id, job_type, input_path }
 *   job_progress  - { job_id, current, total, ... }
 *   job_completed  - { job_id, status: "completed"|"failed", error? }
 *
 * Image events:
 *   image_scored  - { file_path, image_id?, ... }
 *   image_updated - { image_id, ... } - use to refresh gallery
 *   image_discovered - { path }
 *
 * Folder events:
 *   folder_updated  - { folder_path } - use to refresh folder tree
 *   folder_deleted  - { path }
 *   folder_discovered - { path }
 *   folder_scanned  - { folder_path, new_images }
 *
 * Stack events:
 *   stack_created  - { summary }
 *   stack_updated - { stack_id }
 *   stack_deleted - { stack_id }
 *   stacks_cleared - {}
 */

class WebSocketService {
    private ws: WebSocket | null = null;
    private url: string = '';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 50;
    private minReconnectInterval: number = 1000; // 1 second
    private maxReconnectInterval: number = 30000; // 30 seconds
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private handlers: Map<string, Set<MessageHandler>> = new Map();
    private intentionalDisconnect: boolean = false;

    constructor() {
    }

    /**
     * Calculate exponential backoff with jitter.
     * Starts at 1s, doubles each attempt up to 30s max.
     */
    private getReconnectDelay(): number {
        const baseDelay = Math.min(
            this.minReconnectInterval * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectInterval
        );
        // Add ±20% jitter to avoid thundering herd
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
        return Math.max(this.minReconnectInterval, baseDelay + jitter);
    }

    public async connect() {
        this.intentionalDisconnect = false;

        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        // Check if we've exceeded max reconnection attempts
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WebSocket] Max reconnection attempts reached, giving up');
            return;
        }

        try {
            const config = await bridge.getApiConfig();
            this.url = config.url.replace('http', 'ws') + '/ws/updates'; // Assuming WS endpoint is at /ws/updates

            console.log(`[WebSocket] Connecting to: ${this.url} (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WebSocket] Connected successfully');
                // Reset reconnect counter on successful connection
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    this.dispatch(message.type, message.data);
                } catch (e) {
                    console.error('[WebSocket] Failed to parse message:', e);
                }
            };

            this.ws.onclose = () => {
                if (this.intentionalDisconnect) {
                    console.log('[WebSocket] Disconnected intentionally');
                    return;
                }

                console.log('[WebSocket] Disconnected, scheduling reconnect...');
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
                this.ws?.close();
            };

        } catch (e) {
            console.error('[WebSocket] Failed to initialize connection:', e);
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule a reconnection attempt with exponential backoff.
     */
    private scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WebSocket] Max reconnection attempts reached, stopping reconnect');
            return;
        }

        const delay = this.getReconnectDelay();
        console.log(`[WebSocket] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

        this.reconnectAttempts++;
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }

    public disconnect() {
        this.intentionalDisconnect = true;

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        console.log('[WebSocket] Disconnected');
    }

    public on(type: string, handler: MessageHandler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type)?.add(handler);
    }

    public off(type: string, handler: MessageHandler) {
        this.handlers.get(type)?.delete(handler);
    }

    private dispatch(type: string, data: unknown) {
        const handlers = this.handlers.get(type);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }
}

export const webSocketService = new WebSocketService();
