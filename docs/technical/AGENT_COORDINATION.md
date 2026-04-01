# Agent Coordination: Integration Guide

This document defines the coordination protocols for AI agents working across the [image-scoring-backend](https://github.com/synthet/image-scoring) (backend) and [image-scoring-gallery](https://github.com/synthet/electron-image-scoring) (gallery) projects.

## 🏗️ Architectural Overview

The integration relies on two primary shared components:
1.  **Shared Database**: PostgreSQL + pgvector (running in Docker).
    *   **Owner**: `image-scoring-backend` defines the schema in `modules/db_postgres.py` and versioned migrations via Alembic.
    *   **Consumer**: `image-scoring-gallery` performs high-speed queries for the UI via `pg` (node-postgres).
2.  **Service Interface**: FastAPI backend (default port `7860`).
    *   **Provider**: `image-scoring-backend` exposes endpoints for scoring, tagging, and clustering.
    *   **Consumer**: `image-scoring-gallery` triggers jobs via this API.

## 🤝 Coordination Protocols

### 1. Schema Changes
*   **Protocol**: Changes to the database schema MUST be implemented in the backend project first (via Alembic migrations).
*   **Agent Action**: The backend agent should notify the frontend agent (or the user) of any column additions, removals, or type changes.
*   **Sync Point**: The frontend agent must update `electron/db.ts` to reflect the new schema in query logic.

### 2. API Contract
*   **Protocol**: The backend defines the REST API surface in `modules/api.py`.
*   **Agent Action**: Any modification to request/response structures or endpoint paths requires a corresponding update in the frontend.
*   **Sync Point**: The frontend agent must update `electron/apiService.ts` and relevant frontend hooks.

### 3. Shared Resource Configuration
*   **Protocol**: Configuration paths in `image-scoring-gallery/config.json` point to resources in `image-scoring-backend/`.
*   **Agent Action**: Moving the database Docker container or changing connection credentials necessitates config updates in both projects.

## 🔍 Troubleshooting with MCP

Agents in both projects have access to the `image-scoring` MCP server. Use it to diagnose cross-project issues:

| Tool | Usage in Coordination |
|------|------------------------|
| `get_recent_jobs` | Verify if a job triggered by the Electron app actually started in the backend. |
| `check_database_health` | Diagnose data inconsistencies after bulk operations. |
| `query_images` | Compare CLI/DB output with UI results to locate bugs in the query layer. |
| `get_runner_status` | Check if background workers (scoring/tagging) are alive. |

## 📚 Maintenance
Keep this document and `AGENTS.md` in both repositories synchronized after any major integration refactor.
