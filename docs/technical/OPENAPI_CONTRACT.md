---
type: "Technical Reference"
title: "OpenAPI Contract (Gallery Consumer)"
description: "Driftara Gallery does not define its own REST OpenAPI spec. The canonical contract is owned by image-scoring-backend:"
resource: "docs/technical/OPENAPI_CONTRACT.md"
tags: ["gallery-docs", "technical"]
timestamp: 2026-06-16T00:00:00Z
---

# OpenAPI Contract (Gallery Consumer)

Driftara Gallery does **not** define its own REST OpenAPI spec. The canonical contract is owned by **image-scoring-backend**:

- [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md)
- [openapi.yaml](https://github.com/synthet/image-scoring-backend/blob/main/docs/reference/api/openapi.yaml)
- Cross-project overview: [OPENAPI_CROSS_PROJECT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/OPENAPI_CROSS_PROJECT.md)

## Local synced artifacts

| Path | Purpose |
|------|---------|
| [api-contract/openapi.json](../../api-contract/openapi.json) | Committed snapshot of backend `openapi.json` |
| [electron/api.generated.ts](../../electron/api.generated.ts) | Machine-generated types (`openapi-typescript`) |
| [electron/apiTypes.ts](../../electron/apiTypes.ts) | Hand-written types; primary in many IPC paths today |

These files are **not** authority — they mirror the backend. When they drift, refresh from the sibling backend repo or a running WebUI.

## Commands

From gallery repo root (expects sibling `../image-scoring-backend`):

```bash
npm run contract:diff          # copy backend openapi.json → api-contract/
npm run contract:update        # fetch live backend /openapi.json (fallback to sibling)
npm run contract:check         # fail if snapshot is stale
npm run generate:api-types     # openapi.json → electron/api.generated.ts
npm run contract:validate      # snapshot vs apiTypes.ts / apiService.ts coverage
```

## When backend API changes

1. Backend updates code + `openapi.json` + `openapi.yaml` + `API_CONTRACT.md` first.
2. Run `npm run contract:diff` and `npm run generate:api-types` here.
3. Update [electron/apiService.ts](../../electron/apiService.ts) and [electron/apiTypes.ts](../../electron/apiTypes.ts) for new/changed endpoints.
4. Run `npx tsc -p electron/tsconfig.json --noEmit` and relevant tests.

See [integration/TODO.md](../integration/TODO.md) for backlog split by backend vs gallery work.
