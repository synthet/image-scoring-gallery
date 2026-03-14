# 08 - Python Pipeline Integration (Gradio & Headless)

*Status: **In Progress***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Unify the communication between the Electron app and the Python ML pipeline using specialized IPC and WebSocket bridges.

## Current Status

- **WebSocket Connection**: Implemented in `src/services/WebSocketService.ts`.
- **API Service**: Implemented in `electron/apiService.ts`.
- **Preload Bridge**: Exposes pipeline triggers to the renderer.

## Integration Architecture

1. **WebSocket Updates**
   - The frontend listens for `image_updated`, `job_progress`, and `stack_created` events.
   - `AppContent.tsx` subscribes to these to trigger UI refreshes or notifications.

2. **REST API (FastAPI)**
   - Used for deterministic requests (fetching details, starting jobs, searching neighbors).
   - Handled via the main process `ApiService` to bypass CORS and simplify auth.

3. **IPC Bridge**
   - Renderer uses `window.electron` methods like `runProcessingJob` or `searchSimilarImages`.
   - Main process translates these to either REST calls or WebSocket messages.

## Next Steps

- **Pipeline Monitoring Panel**: Implement a dedicated UI component to track long-running embedding jobs (e.g., UMAP generation or bulk tagging).
- **Error Recovery**: Better handling of Python process restarts and stale WebSocket connections.
