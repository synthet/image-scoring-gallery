# Agent Project Guide: Electron Image Scoring Gallery

This guide provides instructions for AI agents on how to navigate, maintain, and execute the Electron-based Image Scoring Gallery.

## Project Context
`image-scoring-gallery` is the frontend viewer for the Image Scoring ecosystem. It is built with Electron and React and connects to a shared PostgreSQL database (with pgvector) populated by the core scoring engine.

## Core Agentic Skills (Commands)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Build the production application |
| `npm run lint` | Run ESLint checks |

## Technical Knowledge for Agents

### 1. Database Connectivity
- The app uses `pg` (node-postgres) to connect to PostgreSQL via `electron/db/provider.ts`.
- **CRITICAL**: Database credentials are configured in `config.json` under `database.postgres.*`.
- All database operations must be performed in the **Main Process** (`electron/db.ts`).
- Legacy `engine: "firebird"` config values are automatically mapped to the Postgres connector.

### 2. Architecture
- **Main Process**: Handles DB, OS integration, and file system tasks.
- **Renderer Process**: Handles the UI and user interactions.
- **IPC**: Communication via `contextBridge` in `preload.ts`.

### 3. Image Handling
- Previews are extracted from images or RAW files.
- RAW support is provided via `libraw-wasm` or `exiftool-vendored`.

## Best Practices for Maintenance
- **TypeScript**: Always use strict typing for IPC and DB interfaces.
- **State**: Use `zustand` for shared UI state.
- **Performance**: Use virtualization for long lists (e.g., `react-virtuoso` in the gallery).

## Troubleshooting Flow
1. Check `npm run lint` for syntax or type errors.
2. Verify PostgreSQL is accessible (`localhost:5432`). Ensure Docker container is running.
3. Check Electron console (Main) and DevTools (Renderer) for errors.
