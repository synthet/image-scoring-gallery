---
description: Debug gallery ↔ backend connection (webui.lock, API URL, Postgres)
---

## Purpose

When the app shows connection errors or empty data: verify **backend URL**, **lock file**, and **DB engine** mode.

## When to use

- `npm run doctor` fails; FastAPI unreachable; `api` SQL mode errors.

## Canonical docs first

- [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md)
- [docs/architecture/02-database-design.md](../../docs/architecture/02-database-design.md)
- [.cursor/agents/gallery-mcp-debug.md](../../.cursor/agents/gallery-mcp-debug.md)
- Backend: [docs/DIAGNOSTICS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DIAGNOSTICS.md)

## Safe checks

1. **Sibling layout:** gallery and backend cloned as siblings (recommended for `webui.lock` discovery).
2. **`npm run doctor`** — reports config, lock, and HTTP probe results (`scripts/doctor.mjs`).
3. **`config.json`:** `database.engine` (`postgres` vs `api`), `config.api.url` / `config.api.port` overrides.
4. **Backend:** start WebUI from backend repo (`run_webui.bat` or `python webui.py` in WSL); confirm port (often 7860).
5. **Optional MCP:** `gallery_status` via **imgscore-el-gallery** (see AGENTS.md).

## Common failure modes

- Stale `webui.lock` pointing at wrong port.
- WSL backend not reachable from Windows gallery (use correct host/port).

## Do not

- Do not hardcode `localhost:7860` in code without consulting config/lock precedence.
