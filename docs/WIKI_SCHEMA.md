---
type: "Documentation"
title: "Wiki schema — image-scoring-gallery docs/"
description: "This repo keeps docs/ as a small wiki aligned with image-scoring-backend habits: indexed sections, relative links, and an activity log."
resource: "docs/WIKI_SCHEMA.md"
tags: ["gallery-docs", "okf"]
timestamp: 2026-06-16T00:00:00Z
okf_version: 0.1
---

# Wiki schema — image-scoring-gallery `docs/`

This repo keeps `docs/` as a small wiki aligned with **image-scoring-backend** habits: indexed sections, relative links, and an activity log.

The docs tree is also structured as an **Open Knowledge Format (OKF)-style bundle**: every Markdown page is a concept file with lightweight YAML frontmatter, the file path is the stable concept identity, section `README.md`/`INDEX.md` pages provide progressive-disclosure navigation, normal Markdown links express relationships, and `log.md` records chronological change history.

**Cross-repo profile authority:** [image-scoring-backend `docs/OKF_ADOPTION.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/OKF_ADOPTION.md) (official [OKF SPEC v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), Vexlum deviations, automated lint). This file documents gallery-specific folder layout and examples.

## OKF concept frontmatter

Every `docs/**/*.md` file starts with YAML frontmatter containing the repo's OKF interoperability surface:

| Field | Required | Purpose |
|-------|----------|---------|
| `type` | Yes | Concept class, such as `Index`, `Guide`, `Architecture`, `Implemented Feature`, `Planned Feature`, `Report`, `Technical Reference`, `Backlog`, or `Log`. |
| `title` | Yes | Human-readable page title, usually matching the first H1. |
| `description` | Yes | Short summary that agents and search tools can show without reading the full page. |
| `resource` | Yes | Repository-relative path to the Markdown file (`docs/...`); this mirrors the file-path concept identity. |
| `tags` | Yes | Small list of queryable tags. Include `gallery-docs` plus folder/topic tags. |
| `timestamp` | Yes | Last documentation-structure or content refresh timestamp in UTC ISO-8601 form. |
| `okf_version` | Recommended | Use `0.1` for pages updated under the shared Vexlum OKF profile. |

Example:

```yaml
---
type: "Guide"
title: "Testing and Coverage"
description: "Vitest and coverage notes for renderer and Electron-facing tests."
resource: "docs/guides/03-testing-and-coverage.md"
tags: ["gallery-docs", "guides"]
timestamp: 2026-06-16T00:00:00Z
okf_version: 0.1
---
```

When a page moves, update `resource` and all relative links in the same change. When a page's meaning changes materially, refresh `description`, `tags`, and `timestamp`.

## Automated OKF lint

Lint runs from the sibling **image-scoring-backend** clone (shared script; no duplicate Python in this repo):

```bash
# From image-scoring-backend repo root
python scripts/okf_lint.py ../image-scoring-gallery/docs --profile vexlum --bundle-name docs
```

`log.md` has no frontmatter requirement. Use `--profile minimal` for OKF v0.1 type-only checks.

## Page types and folders

| Folder | Purpose |
|--------|---------|
| [`architecture/`](architecture/) | System overview, DB design, backup/import alignment |
| [`features/implemented/`](features/implemented/) | Shipped product capabilities (see [INDEX](features/implemented/INDEX.md)) |
| [`features/planned/`](features/planned/) | Future specs (e.g. embeddings hub, native viewer) |
| [`guides/`](guides/) | Lint, backend config, testing/coverage |
| [`integration/`](integration/) | REST/WebSocket integration backlog |
| [`planning/`](planning/) | Roadmaps, migration notes, high-impact tasks |
| [`project/`](project/) | Backlog workflow, governance aliases |
| [`reports/`](reports/) | Dated audits and reviews |
| [`technical/`](technical/) | Terminology stubs, DB refactor analysis pointing at backend |

## Naming

- **Numbered guides/planning:** `NN-topic.md` inside `guides/` and `planning/` where a sequence exists.
- **Features:** `features/implemented/` use `NN-short-name.md`; `features/planned/` may use topic folders (e.g. `embeddings/`).
- **Reports:** prefer `NN-topic-YYYY-MM.md` under `reports/`.

## Links

- **Relative** links between pages under `docs/`.
- **Backend authority:** use full GitHub URLs to `image-scoring-backend` for API, schema, and coordination (see [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md)).

## Indexes and activity log

After adding, renaming, or removing pages:

1. Update [`README.md`](README.md) in the matching section and [`features/implemented/INDEX.md`](features/implemented/INDEX.md) when shipped scope changes.
2. Append to [`log.md`](log.md) under the current month:

`- YYYY-MM-DD: <verb> — <details and paths>`

Verbs: `ingested`, `created`, `updated`, `lint-fixed`, `filed-back`, `reorganized`.

## Cursor / Claude

- Rules: [`.cursor/rules/documentation.mdc`](../.cursor/rules/documentation.mdc) (wiki edits).
- Claude Code: [`.claude/rules/documentation.mdc`](../.claude/rules/documentation.mdc) (mirror rule for the same scope).
