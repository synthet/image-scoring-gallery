# Agent Project Guide: Driftara Gallery

This guide provides instructions for AI agents on how to navigate, maintain, and execute **Driftara Gallery** (`image-scoring-gallery`).

## Backlog & queue (read first)

The canonical task queue is the **GitHub Project board** — not `TODO.md`:

**→ https://github.com/users/synthet/projects/1**

It spans `image-scoring-gallery` and `image-scoring-backend`. Every agent must follow the **five-step contract** in [`skills/backlog-queue/SKILL.md`](skills/backlog-queue/SKILL.md): pick from `Stage = Ready` → `/task-claim <N>` → `In Progress` on first commit → `Blocked` (with comment) if stuck → PR with `Closes #<N>` → `Review` → `Done`.

`TODO.md` is a pointer only — never add tasks there.

## Documentation authority

Before changing IPC contracts, stage labels, or backend integration: read **[`docs/CANONICAL_SOURCES.md`](../docs/CANONICAL_SOURCES.md)**. For wiki structure and `docs/log.md` rules, read **[`docs/WIKI_SCHEMA.md`](../docs/WIKI_SCHEMA.md)**. Shipped features are indexed under **[`docs/features/implemented/INDEX.md`](../docs/features/implemented/INDEX.md)**.

**Agent infra:** **[`AGENT_INFRA_INVENTORY.md`](AGENT_INFRA_INVENTORY.md)**, **[`COMMANDS.md`](COMMANDS.md)**, **[`SAFETY.md`](SAFETY.md)**, **[`subagents/README.md`](subagents/README.md)**, **[`workflows/`](workflows/)**, **[`AGENT_INFRA_STATUS.json`](AGENT_INFRA_STATUS.json)**.

## Project Context
**Driftara Gallery** (`image-scoring-gallery`) is the desktop viewer for libraries managed by **Vexlum Scoring** (`image-scoring-backend`). It is built with Electron and React and connects to PostgreSQL (with pgvector) and/or the backend API.

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
