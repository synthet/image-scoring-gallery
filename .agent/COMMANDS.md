# Command quick reference — image-scoring-gallery

From [AGENTS.md](../AGENTS.md), [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md), and [package.json](../package.json). Run from **repo root** unless noted.

## Setup

- `npm install`
- `npm install` and `npm run build` under `mcp-server/` once if using gallery MCP (`is-ui-*`; copy `.cursor/mcp.example.json` → `.cursor/mcp.json`)
- PostgreSQL: typically via sibling **image-scoring-backend** `docker compose up -d` when using local `pg` mode

## Diagnostics

- `npm run doctor` — Node, `config.json`, optional `webui.lock` / backend URL probes (see `scripts/doctor.mjs`)

## Development

- Full dev (server + Vite + Electron): `npm run dev`
- Web only (no Electron): `npm run dev:web`
- Linux / headless-friendly: `npm run dev:web`, then `npx tsc -p electron/tsconfig.json`, then `ELECTRON_IS_DEV=1 npx electron .` per AGENTS.md

## Types / lint / tests

- Renderer: `npx tsc --noEmit`
- Electron main: `npx tsc -p electron/tsconfig.json --noEmit` (plan uses `--noEmit`; package `dev:electron` uses compile — both valid for CI checks)
- Lint: `npm run lint`
- Tests: `npm run test:run`

## API contract sync (with backend)

- Check: `npm run contract:check`
- Update from backend OpenAPI (when workflow says): `npm run contract:update` or per [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md)
- Validate: `npm run contract:validate`

## Docs / wiki

- [docs/CANONICAL_SOURCES.md](../docs/CANONICAL_SOURCES.md), [docs/WIKI_SCHEMA.md](../docs/WIKI_SCHEMA.md)
- After wiki edits: append [docs/log.md](../docs/log.md)

## MCP / support

- Primary: **`is-ui-local`** / **`is-ui-router`** — start with `gallery_status` (see AGENTS.md)
- Backend triage: sibling **`is-be-mcp`** (`search` → `dispatch`)

## Cross-repo

- Backend doctor: in sibling clone, WSL + `python scripts/doctor.py --no-gpu`
- Contract workflow: [.agent/workflows/cross_repo_contract_change.md](workflows/cross_repo_contract_change.md)
