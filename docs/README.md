# Documentation Index

Welcome to the **Electron Image Scoring** documentation. This index provides a structured overview of the project's architecture, features, and planning.

**Backlog:** The canonical task list is repo-root [`TODO.md`](../TODO.md). **Workflow** (same pattern as **image-scoring-backend**) — [`project/00-backlog-workflow.md`](project/00-backlog-workflow.md) ([`BACKLOG_GOVERNANCE.md`](project/BACKLOG_GOVERNANCE.md) is an alias). Reconcile roadmap/TODO docs at least weekly and immediately after any task is marked complete or reopened.

## Related repository: image-scoring-backend

Python scoring engine, FastAPI, and PostgreSQL schema (**[image-scoring-backend](https://github.com/synthet/image-scoring-backend)**).

| Topic | Documentation (GitHub) |
|--------|-------------------------|
| Full docs index | [docs/INDEX.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/INDEX.md) |
| API contract | [docs/technical/API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md) |
| Firebird → PostgreSQL migration | [docs/plans/database/FIREBIRD_POSTGRES_MIGRATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/database/FIREBIRD_POSTGRES_MIGRATION.md) |
| Embedding applications (backend plan) | [docs/plans/embedding/EMBEDDING_APPLICATIONS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/embedding/EMBEDDING_APPLICATIONS.md) |
| DB vectors / normalization | [docs/plans/database/DB_VECTORS_REFACTOR.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/database/DB_VECTORS_REFACTOR.md) |
| Agent coordination (canonical) | [docs/technical/AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) |

---

## Architecture

Core system design and high-level technical overviews.

- [01 - System Overview](architecture/01-system-overview.md) - High-density project context, tech stack, and entry points
- [02 - Database Design](architecture/02-database-design.md) - Database engine overview, migration recommendations, and connection logic

---

## Features

Documentation for implemented and planned features.

### Implemented

- [01 - NEF/RAW Fallback](features/implemented/01-nef-raw-fallback.md) - Multi-tier preview extraction system for Nikon RAW files

### Planned

- [01 - Windows Native Viewer](features/planned/01-windows-native-viewer.md) - Future native high-performance viewer
- [Embedding Applications](features/planned/embeddings/README.md) - AI-powered similarity search and data analysis (8 specs)

---

## Reports

Code reviews, design audits, and quality assessments.

- [01 - Code Design Review (Mar 2026)](reports/01-code-design-review-2026-03.md) - Comprehensive architectural audit with remediation status
- [02 - Code Review (Feb 2026)](reports/02-code-review-2026-02.md) - Snapshot of earlier design decisions
- [03 - ESLint Audit (Mar 2026)](reports/03-eslint-audit-2026-03.md) - Code quality status and linting recommendations

---

## Planning

Roadmap, migration plans, and task tracking.

- [00 - Backlog workflow (redirect)](planning/00-backlog-workflow.md) - Stable link; canonical content: [`project/00-backlog-workflow.md`](project/00-backlog-workflow.md)
- [01 - Roadmap (TODO)](planning/01-roadmap-todo.md) - Mirror of root `TODO.md` for planning readers
- [02 - Firebird to PostgreSQL Migration](planning/02-firebird-postgresql-migration.md) - Completed coordinated migration (reference)
- [03 - High-impact tracked tasks (EIS)](planning/03-high-impact-tracked-tasks.md) - Auditable initiatives with definition of done
- [04 - Gradio to Electron Processing Migration](planning/04-gradio-to-electron-processing-migration.md) - Plan/spec for replacing Gradio pipeline UI with Electron Processing workspace

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

- [01 - Lint Recommendations](guides/01-lint-recommendations.md) - Code quality and ESLint fix guidance
- [02 - API Backend Configuration](guides/02-api-backend-config.md) - How `config.api.url` / `host` / `port` interact with backend lock-file discovery
- [Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) - Cross-project integration (canonical copy in **image-scoring-backend**); local stub: [`technical/AGENT_COORDINATION.md`](technical/AGENT_COORDINATION.md)

---

**Navigation**: [Top](#documentation-index) | [Architecture](#architecture) | [Features](#features) | [Reports](#reports) | [Project](#project) | [Planning](#planning) | [Integration](#integration) | [Guides](#guides)
