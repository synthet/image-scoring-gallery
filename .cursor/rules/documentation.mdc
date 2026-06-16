---
description: Conventions for maintaining docs/ as an OKF-style wiki — frontmatter, cross-references, indexes, logs, page structure
globs: "docs/**"
alwaysApply: false
---

# Documentation wiki conventions

These conventions apply when creating, updating, or reorganizing pages in `docs/`.


## Authority (read first)

- **[docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md)** — integration and backend canonical links.
- **[docs/WIKI_SCHEMA.md](../../docs/WIKI_SCHEMA.md)** — OKF frontmatter contract, folder taxonomy, naming, and docs/log.md rules.

## Page structure

- Every page starts with YAML frontmatter, followed by a blank line and then a `# Title` header.
- Required frontmatter fields for `docs/**/*.md`: `type`, `title`, `description`, `resource`, `tags`, `timestamp`; recommend `okf_version: 0.1`.
- Profile authority: [backend OKF_ADOPTION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/OKF_ADOPTION.md).
- `resource` must be the repository-relative Markdown path and must change when a page moves.
- `title` should match the page H1 unless there is a specific reason to expose a shorter machine-readable title.
- `description` should be a concise one-sentence summary suitable for search results and agent routing.
- `tags` should include `gallery-docs` plus useful folder/topic tags.
- `timestamp` should be UTC ISO-8601 and refreshed when the page's meaning, metadata, or structure changes materially.
- First paragraph after the title is a one-sentence summary of the page's purpose.
- Use standard markdown links with relative paths. Never use `[[wikilink]]` syntax.

## Cross-referencing

- Link related pages **bidirectionally**. When you add a link from page A → B, check whether B should also link back to A.
- Use relative paths from the linking file (e.g., `../architecture/02-database-design.md`).
- Use anchors for long pages (e.g., `02-database-design.md#connection-logic`).
- Cross-repo links to **image-scoring-backend** use full GitHub URLs (existing convention).

## Index maintenance

After creating, renaming, or removing a page:

1. Add or refresh the OKF frontmatter for every affected page.
2. Update `docs/README.md` — add or update the entry in the correct category section.
3. Maintain the existing format: `- [Title](relative/path.md) - One-line description`.
4. Keep numbered ordering within each category.

## Activity log

After any wiki operation (ingest, lint fix, new page, significant update), append to `docs/log.md`:

```
- YYYY-MM-DD: <verb> — <details and pages affected>
```

Verbs: `ingested`, `created`, `updated`, `lint-fixed`, `filed-back`, `reorganized`.

Group entries under month headers (`## YYYY-MM`). Add a new month header when the month changes.

## Naming conventions

- **Filenames**: kebab-case (e.g., `database-design.md`).
- **Numbered prefixes**: Use `01-`, `02-` for ordered sequences within a category.
- **Reports**: Include date suffix: `01-topic-YYYY-MM.md`.
- **Technical references**: `UPPER_CASE.md` (e.g., `PIPELINE_TERMINOLOGY.md`).

## Page types

Map to existing category subdirectories:

| Category | Purpose | Example |
|----------|---------|---------|
| `architecture/` | System design, high-level overviews | `01-system-overview.md` |
| `features/implemented/` | Shipped features | `01-nef-raw-fallback.md` |
| `features/planned/` | Specs for future work | `01-windows-native-viewer.md` |
| `reports/` | Point-in-time audits and reviews | `01-code-design-review-2026-03.md` |
| `planning/` | Roadmaps, migrations, task tracking | `01-roadmap-todo.md` |
| `guides/` | How-to and workflow docs | `01-lint-recommendations.md` |
| `technical/` | Reference docs | `PIPELINE_TERMINOLOGY.md` |
| `project/` | Governance, backlog workflow | `00-backlog-workflow.md` |
| `integration/` | API and backend integration | `TODO.md` |

## Staleness

- When updating a page, check date or version references. If information contradicts current code, fix it or add a dated note.
- Pages with "Last evaluated" markers should be re-evaluated when the referenced area changes.
- Run OKF lint from sibling backend: `python scripts/okf_lint.py ../image-scoring-gallery/docs --profile vexlum --bundle-name docs`
