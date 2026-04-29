# Wiki schema — image-scoring-gallery `docs/`

This repo keeps `docs/` as a small wiki aligned with **image-scoring-backend** habits: indexed sections, relative links, and an activity log.

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
