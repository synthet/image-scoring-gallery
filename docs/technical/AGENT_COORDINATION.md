# Agent Coordination (stub)

Cross-project integration rules for **image-scoring-gallery** ↔ **image-scoring-backend** are maintained in a **single canonical document** in the backend repo:

**[Agent Coordination — Integration Guide](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md)** (canonical copy in **image-scoring-backend**)

Read that guide for shared database ownership (PostgreSQL + Alembic), FastAPI contract (`modules/api.py`), and MCP troubleshooting.

**Gallery-specific sync points:**

- **`electron/db.ts`** — Query layer must match backend schema and views; see [DATABASE_REFACTOR_ANALYSIS.md](DATABASE_REFACTOR_ANALYSIS.md) for refactor impact.
- **`electron/apiService.ts`** — Must stay aligned with backend REST shapes and paths when jobs or metadata APIs change.

For backlog habits and cross-repo task tags, see [`docs/project/00-backlog-workflow.md`](../project/00-backlog-workflow.md) (this repo; [`BACKLOG_GOVERNANCE.md`](../project/BACKLOG_GOVERNANCE.md) is an alias) and the backend twin **[`00-backlog-workflow.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/00-backlog-workflow.md)**; also [`docs/integration/TODO.md`](../integration/TODO.md).
