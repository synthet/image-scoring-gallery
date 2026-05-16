---
description: Update gallery docs / wiki
---

## Purpose

Maintain **gallery** `docs/` with correct authority boundaries (backend owns API/schema).

## When to use

- New shipped feature page, integration notes, README updates.

## Canonical docs first

- [docs/WIKI_SCHEMA.md](../../docs/WIKI_SCHEMA.md)
- [docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md)
- [.cursor/rules/documentation.mdc](../../.cursor/rules/documentation.mdc)
- [.cursor/skills/docs-wiki/SKILL.md](../../.cursor/skills/docs-wiki/SKILL.md)

## Safe process

1. Prefer **relative** links inside this repo.
2. Use **full GitHub URLs** to **image-scoring-backend** for API, DB, and pipeline authority.
3. Update [docs/README.md](../../docs/README.md) / indexes when adding navigable pages.
4. Append [docs/log.md](../../docs/log.md).

## Do not

- Do not copy large schema tables from backend — **link** DB_SCHEMA / API_CONTRACT instead.
