# Documentation Index

Welcome to the **Driftara Gallery** documentation. This index provides a structured overview of the desktop app’s architecture, features, and planning.

**Backlog:** The canonical task list is repo-root [`TODO.md`](../TODO.md). **Workflow** (same pattern as **image-scoring-backend**) — [`project/00-backlog-workflow.md`](project/00-backlog-workflow.md) ([`BACKLOG_GOVERNANCE.md`](project/BACKLOG_GOVERNANCE.md) is an alias). Reconcile roadmap/TODO docs at least weekly and immediately after any task is marked complete or reopened.

**Wiki governance:** **[`CANONICAL_SOURCES.md`](CANONICAL_SOURCES.md)** (integration authority + backend links) · **[`WIKI_SCHEMA.md`](WIKI_SCHEMA.md)** (folder taxonomy, log rules) · **[`features/implemented/INDEX.md`](features/implemented/INDEX.md)** (shipped features hub) · **[`log.md`](log.md)** (activity log)

## Related repository: image-scoring-backend

Python scoring engine, FastAPI, and PostgreSQL schema (**[image-scoring-backend](https://github.com/synthet/image-scoring-backend)**).

| Topic | Documentation (GitHub) |
|--------|-------------------------|
| Full docs index | [docs/INDEX.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/INDEX.md) |
| API contract | [docs/technical/API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md) |
| Firebird → PostgreSQL migration | [docs/planning/database/FIREBIRD_POSTGRES_MIGRATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/database/FIREBIRD_POSTGRES_MIGRATION.md) |
| Phase 4 keywords (hub + archive) | [PHASE4_KEYWORDS_HUB.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/database/PHASE4_KEYWORDS_HUB.md) |
| Embedding applications (backend plan) | [docs/features/planned/embeddings/EMBEDDING_APPLICATIONS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/planned/embeddings/EMBEDDING_APPLICATIONS.md) |
| DB vectors / normalization | [docs/planning/database/DB_VECTORS_REFACTOR.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/database/DB_VECTORS_REFACTOR.md) |
| Agent coordination (canonical) | [docs/technical/AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) |
| Pipeline terminology (cross-repo) | [docs/technical/PIPELINE_TERMINOLOGY.md](technical/PIPELINE_TERMINOLOGY.md) · [backend PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md) |

---

## Architecture

Core system design and high-level technical overviews.

- [01 - System Overview](architecture/01-system-overview.md) - High-density project context, tech stack, and entry points
- [02 - Database Design](architecture/02-database-design.md) - Database engine overview, migration recommendations, and connection logic
- [Import vs Discovery alignment](architecture/import-discovery-alignment.md) - Align gallery Import with pipeline Discovery (indexing)
- [Backup feature](architecture/backup-feature.md) - Backup-related design notes
- [Pipeline terminology](technical/PIPELINE_TERMINOLOGY.md) - Stage display names vs API (`pipelineLabels.ts`, aligned with Gradio/Vite)
- [Database refactor analysis](technical/DATABASE_REFACTOR_ANALYSIS.md) - Gallery impact of backend schema changes (local; canonical coordination in backend AGENT_COORDINATION)

---

## Features

Documentation for implemented and planned features.

### Implemented

→ **[features/implemented/INDEX.md](features/implemented/INDEX.md)** — hub for shipped capability pages (cross-links to **image-scoring-backend**).

| Page | Description |
|------|-------------|
| [01-nef-raw-fallback.md](features/implemented/01-nef-raw-fallback.md) | Multi-tier RAW/NEF preview (IPC + `/api/raw-preview`) |
| [02-desktop-shell-and-navigation.md](features/implemented/02-desktop-shell-and-navigation.md) | Electron shell, gallery modes, main UI areas |
| [03-database-engine-modes.md](features/implemented/03-database-engine-modes.md) | `pg` vs `api` engines, `db:*` IPC |
| [04-backend-api-jobs.md](features/implemented/04-backend-api-jobs.md) | `apiService.ts` + `api:*` IPC ↔ FastAPI |

Canonical shipped API/pipeline catalog (Python repo): [image-scoring-backend `docs/features/implemented/INDEX.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/INDEX.md).

### Planned

- [01 - Windows Native Viewer](features/planned/01-windows-native-viewer.md) - Future native high-performance viewer
- [Embedding Applications](features/planned/embeddings/README.md) - AI-powered similarity search and data analysis (8 specs)

---

## Reports

Code reviews, design audits, and quality assessments.

- [Reports index](reports/README.md) — Short map of dated reports
- [01 - Code Design Review (Mar 2026)](reports/01-code-design-review-2026-03.md) - Comprehensive architectural audit with remediation status
- [02 - Code Review (Feb 2026)](reports/02-code-review-2026-02.md) - Snapshot of earlier design decisions
- [03 - ESLint Audit (Mar 2026)](reports/03-eslint-audit-2026-03.md) - Code quality status and linting recommendations
- [04 - UX/UI Review (Mar 2026)](reports/04-ux-ui-review-2026-03.md) - UX/UI assessment

---

## Planning

Roadmap, migration plans, and task tracking.

- [00 - Backlog workflow](planning/00-backlog-workflow.md) — **Redirect only** (~5 lines); canonical: [`project/00-backlog-workflow.md`](project/00-backlog-workflow.md)
- [01 - Roadmap (TODO)](planning/01-roadmap-todo.md) - Mirror of root `TODO.md` for planning readers
- [02 - Firebird to PostgreSQL Migration](planning/02-firebird-postgresql-migration.md) - Completed coordinated migration (reference)
- [03 - High-impact tracked tasks (EIS)](planning/03-high-impact-tracked-tasks.md) - Auditable initiatives with definition of done
- [04 - Gradio to Electron Processing Migration](planning/04-gradio-to-electron-processing-migration.md) - Plan/spec for replacing Gradio pipeline UI with Electron Processing workspace
- [DB abstraction layer (notes)](planning/db_abstraction_layer.md) - Connector / query-layer notes

---

## Integration

API and backend integration documentation.

- [API Integration TODO](integration/TODO.md) - REST API and WebSocket integration tasks

---

## Project

Backlog index and governance (mirrors [image-scoring-backend `docs/project/`](https://github.com/synthet/image-scoring-backend/tree/main/docs/project)).

- [Project index](project/INDEX.md) — Root `TODO.md`, workflow, archived pointer
- [`00-backlog-workflow.md`](project/00-backlog-workflow.md) — Source of truth, mirror sync order, tracking, hygiene ([`BACKLOG_GOVERNANCE.md`](project/BACKLOG_GOVERNANCE.md) is an alias)

---

## Guides

Development workflows and maintenance recommendations.

- [Guides index](guides/README.md) — Short map of `docs/guides/`
- [01 - Lint Recommendations](guides/01-lint-recommendations.md) - Code quality and ESLint fix guidance
- [02 - API Backend Configuration](guides/02-api-backend-config.md) - How `config.api.url` / `host` / `port` interact with backend lock-file discovery
- [03 - Testing and coverage](guides/03-testing-and-coverage.md) - Vitest / coverage notes
- [Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) - Cross-project integration (canonical copy in **image-scoring-backend**); local stub: [`technical/AGENT_COORDINATION.md`](technical/AGENT_COORDINATION.md)

---

## Activity Log

Chronological record of documentation changes and wiki maintenance.

- [Activity Log](log.md) - All docs updates, ingestions, lint fixes, and queries filed back

---

**Navigation**: [Top](#documentation-index) | [Architecture](#architecture) | [Features](#features) | [Reports](#reports) | [Project](#project) | [Planning](#planning) | [Integration](#integration) | [Guides](#guides) | [Activity Log](#activity-log)
