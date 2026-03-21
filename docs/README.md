# Documentation Index

Welcome to the **Electron Image Scoring** documentation. This index provides a structured overview of the project's architecture, features, and planning.

Roadmap/TODO status should be reconciled at least once per week and immediately after any task is marked complete or reopened.

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

- [01 - Roadmap (TODO)](planning/01-roadmap-todo.md) - Current roadmap, pending tasks, and recent hardening status
- [02 - Firebird to PostgreSQL Migration](planning/02-firebird-postgresql-migration.md) - Coordinated platform migration plan
- [04 - Gradio to Electron Processing Migration](planning/04-gradio-to-electron-processing-migration.md) - Plan/spec for replacing Gradio pipeline UI with Electron Processing workspace

---

## Integration

API and backend integration documentation.

- [API Integration TODO](integration/TODO.md) - REST API and WebSocket integration tasks

---

## Guides

Development workflows and maintenance recommendations.

- [01 - Lint Recommendations](guides/01-lint-recommendations.md) - Code quality and ESLint fix guidance
- [Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) - Cross-project integration and coordination protocols (External)

---

**Navigation**: [Top](#documentation-index) | [Architecture](#architecture) | [Features](#features) | [Reports](#reports) | [Planning](#planning) | [Integration](#integration) | [Guides](#guides)
