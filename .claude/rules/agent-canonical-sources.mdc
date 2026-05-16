---
description: Canonical sources and gallery agent boundaries (Driftara Gallery)
alwaysApply: true
---

# Agent canonical sources (gallery)

## Backend authority

Do **not** invent REST paths, response fields, SQL column names, `phase_code` values, or config keys. Use [docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md) and full GitHub URLs to **image-scoring-backend** technical docs (`API_CONTRACT.md`, `openapi.yaml`, `DB_SCHEMA.md`, `PIPELINE_TERMINOLOGY.md`, `AGENT_COORDINATION.md`).

## Electron and IPC

- **Database and filesystem access** belong in the **Electron main process** and are exposed to the renderer only via **`preload` / `contextBridge` / IPC**.
- **Do not** add direct renderer-process database clients or raw filesystem access from React.

## Commands (verify frequently)

- `npm run doctor`
- `npm run dev` (see [.agent/workflows/run_gallery_dev.md](../../.agent/workflows/run_gallery_dev.md))
- `npx tsc --noEmit`
- `npx tsc -p electron/tsconfig.json --noEmit`
- `npm run lint`

## Backend connectivity when debugging

- Resolve API URL/port via **`webui.lock`** (sibling backend) and **`config.json`** overrides — see [.agent/workflows/debug_gallery_backend_connection.md](../../.agent/workflows/debug_gallery_backend_connection.md).

## RAW / NEF / EXIF / export

- Changes require **regression tests**; see [docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md) and [docs/features/implemented/05-jpeg-export-exif-orientation.md](../../docs/features/implemented/05-jpeg-export-exif-orientation.md).

## Agent infra index

- [.agent/AGENT_INFRA_INVENTORY.md](../../.agent/AGENT_INFRA_INVENTORY.md), [.agent/COMMANDS.md](../../.agent/COMMANDS.md), [.agent/SAFETY.md](../../.agent/SAFETY.md), [.agent/workflows/](../../.agent/workflows/)
