---
description: Verify gallery dev environment — Node, types, lint, doctor
---

## Purpose

Sanity-check **image-scoring-gallery** before feature work: dependencies, TypeScript, ESLint, **npm run doctor**.

## When to use

- New clone, CI debugging, “nothing connects” reports.

## Canonical docs first

- [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md)
- [docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md)
- [AGENTS.md](../../AGENTS.md)

## Safe commands (repo root)

```bash
npm install
npm run doctor
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npm run lint
```

- **Tests (optional):** `npm run test:run`
- **PostgreSQL:** if using local `pg` mode, ensure Docker/other instance is up (often via sibling backend `docker compose up -d`).

## Common failure modes

- Backend URL wrong: check `config.json` and sibling `webui.lock` discovery (see [debug_gallery_backend_connection.md](debug_gallery_backend_connection.md)).
- Stale `node_modules`: reinstall.

## Do not

- Do not bake machine-specific absolute paths into docs or workflows.
