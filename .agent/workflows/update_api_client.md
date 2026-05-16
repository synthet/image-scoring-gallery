---
description: Update API client and generated types vs backend OpenAPI
---

## Purpose

Keep **HTTP client** and **generated TypeScript** aligned with **backend** OpenAPI / FastAPI.

## When to use

- Endpoint added or changed on backend; `apiService.ts` drift.

## Canonical docs first

- [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md)
- Backend: [API_CONTRACT](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md), [openapi.yaml](https://github.com/synthet/image-scoring-backend/blob/main/docs/reference/api/openapi.yaml)
- `electron/apiService.ts`, `scripts/sync-api-contract.mjs`, `scripts/generate-api-types.mjs`

## Safe commands (repo root)

```bash
npm run contract:check
# After backend updates and refreshed OpenAPI in sync script inputs:
npm run contract:update
npm run contract:validate
```

## Do not

- Do not hand-edit generated files if the repo treats them as generated-only (follow conventions in DEVELOPMENT.md).
