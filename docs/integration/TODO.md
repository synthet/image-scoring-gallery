---
type: "Backlog"
title: "Integration TODO"
description: "This backlog separates backend-owned contract work from gallery implementation work. The canonical project/task queue may still live outside this file; use this page as an integrat"
resource: "docs/integration/TODO.md"
tags: ["backlog", "gallery-docs", "integration"]
timestamp: 2026-06-16T00:00:00Z
---

# Integration TODO

This backlog separates backend-owned contract work from gallery implementation work. The canonical project/task queue may still live outside this file; use this page as an integration handoff map.

## Backend-Owned Contract Changes

These must start in **image-scoring-backend**:

- REST endpoint additions, removals, request fields, response fields, or status semantics.
- OpenAPI changes in backend [openapi.yaml](https://github.com/synthet/image-scoring-backend/blob/main/docs/reference/api/openapi.yaml).
- Database table/column/index/vector-space changes.
- Pipeline phase codes, operation tokens, or user-facing terminology changes.
- WebSocket event shape changes.

Required backend docs:

- [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md)
- [DB_SCHEMA.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/DB_SCHEMA.md)
- [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md)
- [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md)

## Gallery Implementation Tasks

These are gallery-side follow-ups after backend contracts are confirmed:

- Sync [api-contract/](../../api-contract/) and generated API types when OpenAPI changes.
- Update [electron/apiService.ts](../../electron/apiService.ts) for new/changed backend calls.
- Update [electron/apiTypes.ts](../../electron/apiTypes.ts) or generated API files when response/request types change.
- Update [electron/db.ts](../../electron/db.ts) and query tests when schema changes affect direct PostgreSQL mode.
- Update [electron/db/provider.ts](../../electron/db/provider.ts) only for provider/connection behavior changes.
- Update [src/constants/pipelineLabels.ts](../../src/constants/pipelineLabels.ts) and UI copy when backend stage terminology changes.
- Update renderer hooks/stores/components that consume the changed API or IPC surface.

## WebSocket Integration Backlog

- Confirm event shapes against backend [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md) before changing [src/services/WebSocketService.ts](../../src/services/WebSocketService.ts).
- Keep WebSocket client behavior server-to-client unless backend docs confirm bidirectional commands.
- Add tests for reconnection, event parsing, and store updates when changing WebSocket behavior.

## Checks To List In Handoffs

Backend:

```bash
python -m pytest -m "not gpu and not db and not ml and not firebird" --ignore=tests/test_probe.py
python scripts/doctor.py --no-gpu
```

Gallery:

```bash
npm run doctor
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npm run lint
```

Use the exact subset actually run in the final report.
