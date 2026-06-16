---
description: Update gallery OKF-style docs / wiki
---

## Purpose

Maintain **gallery** `docs/` as an OKF-style Markdown concept bundle with correct authority boundaries (backend owns API/schema).

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
3. Preserve or add OKF frontmatter on every touched `docs/**/*.md` page (`type`, `title`, `description`, `resource`, `tags`, `timestamp`).
4. Keep `resource` equal to the repository-relative Markdown path.
5. Update [docs/README.md](../../docs/README.md) / indexes when adding navigable pages.
6. Append [docs/log.md](../../docs/log.md).

## Do not

- Do not copy large schema tables from backend — **link** DB_SCHEMA / API_CONTRACT instead.
