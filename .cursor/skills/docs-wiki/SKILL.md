---
name: docs-wiki
description: >-
  Expert knowledge for maintaining docs/ as an LLM wiki. Page types, naming,
  cross-referencing, index format, log format, and category conventions.
  Triggers: wiki maintenance, docs update, documentation audit, wiki ingest/lint/query.
---

# Docs Wiki Skill

Maintain `docs/` as an incrementally-built, LLM-maintained wiki of interlinked markdown pages.

## When to Apply

- Wiki maintenance tasks (`/wiki-ingest`, `/wiki-lint`, `/wiki-query`)
- Docs updates after code changes
- Documentation audits and health checks
- Answering questions from the wiki

## Wiki Structure

| File | Role |
|------|------|
| `docs/README.md` | **Index** — content catalog, grouped by category, links + one-line descriptions |
| `docs/log.md` | **Activity log** — reverse-chronological record of all wiki operations |
| Category subdirectories | One per page type (see table below) |

## Page Types

| Category | Purpose | Naming | Example |
|----------|---------|--------|---------|
| `architecture/` | System design, overviews | `NN-topic.md` | `01-system-overview.md` |
| `features/implemented/` | Shipped features | `NN-feature.md` | `01-nef-raw-fallback.md` |
| `features/planned/` | Future work specs | `NN-feature.md` or subdirs | `embeddings/00-summary.md` |
| `reports/` | Point-in-time audits | `NN-topic-YYYY-MM.md` | `01-code-design-review-2026-03.md` |
| `planning/` | Roadmaps, migrations | `NN-topic.md` | `02-firebird-postgresql-migration.md` |
| `guides/` | How-to docs | `NN-topic.md` | `01-lint-recommendations.md` |
| `technical/` | Reference docs | `UPPER_CASE.md` | `PIPELINE_TERMINOLOGY.md` |
| `project/` | Governance, backlog | `NN-topic.md` | `00-backlog-workflow.md` |
| `integration/` | API/backend integration | descriptive | `TODO.md` |

## Index Format (`docs/README.md`)

Follow the existing format exactly:

- Grouped by category with `---` horizontal rule separators
- Each category has an `## H2` heading
- Entries: `- [Display Title](relative/path.md) - One-line description`
- Numbered or alphabetical ordering within each category
- Navigation footer at bottom: `[Top](#) | [Section](#section) | ...`

## Log Format (`docs/log.md`)

- **Reverse-chronological** (newest first)
- Entries grouped under month headers: `## YYYY-MM`
- Entry format: `- YYYY-MM-DD: <verb> — <details, pages affected>`
- Verbs: `ingested`, `created`, `updated`, `lint-fixed`, `filed-back`, `reorganized`

## Cross-Referencing Rules

1. **Bidirectional** — When A links to B, B should link back to A (where meaningful).
2. **Relative paths** — From the referencing file, e.g., `../architecture/02-database-design.md`.
3. **Anchors** — Use section anchors for long pages: `file.md#section-name`.
4. **Backend cross-repo** — Full GitHub URLs: `https://github.com/synthet/image-scoring-backend/blob/main/docs/...`.
5. **Local stubs** — When a canonical doc lives in the backend repo, the gallery stub notes where the canonical content is and links to it.

## Page Conventions

- Start with `# Title`. No YAML frontmatter.
- First paragraph is a one-sentence summary.
- Standard markdown links only — no `[[wikilinks]]`.
- Kebab-case filenames, numbered prefixes for ordered sequences.

## Relationship to SDLC Commands

| After this... | Consider this... |
|---------------|------------------|
| `/implement` produces code | `/wiki-ingest` to capture the knowledge |
| Major release or milestone | `/wiki-lint` to keep docs consistent |
| User asks a project question | `/wiki-query` to answer from the wiki |
| `/spec` creates a feature spec | `/wiki-ingest` to file it into the wiki |
| Code review surfaces decisions | `/wiki-ingest` the decision as a report or architecture update |
