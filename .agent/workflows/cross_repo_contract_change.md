---
description: Cross-repo contract change — backend first, then gallery
---

## Purpose

Change **API**, **schema**, or **pipeline terminology** without breaking **Vexlum Scoring** and **Driftara Gallery** consumers.

## When to use

- Any field on REST responses used by gallery, SQL columns used in `electron/db.ts`, or user-visible pipeline labels.

## Canonical docs (read first)

- Backend: [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md), [CANONICAL_SOURCES.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/CANONICAL_SOURCES.md)
- Gallery: [docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md), [docs/integration/TODO.md](../../docs/integration/TODO.md)

## Steps (strict order)

1. **Backend canonical contract** — `API_CONTRACT.md`, `openapi.yaml`, `DB_SCHEMA.md`, `PIPELINE_TERMINOLOGY.md` as applicable.
2. **Backend implementation** — `modules/api.py`, `modules/db_postgres.py`, migrations, phases.
3. **Backend tests** — pytest per backend [TESTING.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/TESTING.md).
4. **Backend docs pass** — `AGENT_COORDINATION.md` if needed; append backend `docs/log.md`.
5. **Gallery integration (this repo)** — `electron/apiService.ts`, IPC/preload types, `src/constants/pipelineLabels.ts`, [docs/integration/TODO.md](../../docs/integration/TODO.md) if work remains.
6. **Backend checks** — doctor + pytest (sibling clone).
7. **Gallery checks** — `npm run doctor`, `npx tsc --noEmit`, `npx tsc -p electron/tsconfig.json --noEmit`, `npm run lint`, `npm run contract:check`.
8. **Handoff note** in PR: repos touched, commands run, follow-ups.

## Do not

- Do not implement gallery-first breaking changes to backend-owned contracts.

**Repo:** This file lives in **image-scoring-gallery** — mirror copy exists in **image-scoring-backend** `.agent/workflows/`.
