---
name: agent-dev-tooling
description: >-
  Gallery build, lint, test, and verify workflows via npm scripts, ESLint,
  TypeScript, and Vitest. Use before claiming work complete or opening a PR.
  Python/uv tools are optional for sibling backend work only.
---

# Agent dev tooling

Task runners, lint, format, and verification for **image-scoring-gallery**.

## Purpose

Run the correct project commands instead of inventing ad hoc toolchains. Primary stack: Node, npm, ESLint, TypeScript, Vitest.

## When to use

- After code changes: lint, typecheck, tests
- Before `/pr-ready`: full verification subset
- Inspecting available scripts in `package.json`
- Optional: Docker Compose when documented for local Postgres/backend

## Required tools

- **Gallery (primary):** `node`, npm, project devDependencies (ESLint, TypeScript, Vitest)
- **Optional cross-repo:** `docker`, `docker compose` (backend Postgres)
- **Optional backend sibling:** `uv`, `ruff`, `pyright` — only when touching **image-scoring-backend**

Install baseline: [agent-cli-hub/references/install-blocks.md](../agent-cli-hub/references/install-blocks.md)

Full command list: [`.agent/COMMANDS.md`](../../../.agent/COMMANDS.md)

## Common commands (gallery — run first)

From repo root:

```bash
npm run lint
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npm run test:run
npm run doctor
```

Development:

```bash
npm run dev          # server + Vite + Electron
npm run dev:web      # no Electron
npm run contract:check
```

Check-only (no writes):

```bash
npm run lint
npx tsc --noEmit
npm run test:run
```

### MCP server (when working on `mcp-server/`)

```bash
cd mcp-server && npm install && npm run build:registry
```

### Optional: sibling backend (WSL)

When the task explicitly involves **image-scoring-backend**:

```bash
# WSL + ~/.venvs/tf — see backend python-wsl-webapp-env rule
python -m pytest -m "not gpu and not db and not ml" --ignore=tests/test_probe.py
ruff check modules/
```

### Docker (backend Postgres)

From sibling backend repo when gallery uses local `pg`:

```bash
docker compose up -d
docker compose config    # validate compose file only
```

### Watch / benchmark (optional)

```bash
hyperfine 'npm run test:run'
entr -c npm run test:run   # when user wants watch mode — confirm first
```

## Agent-safe patterns

- Prefer `npm run lint` and `npx tsc` over global eslint/tsc versions.
- Use `--check` / dry-run modes before `--fix` / `--write`.
- Do not run `npm run build` (packaging) unless the user asked for a build.
- IPC/secrets rules: [`.agent/SAFETY.md`](../../../.agent/SAFETY.md).

## Commands requiring confirmation

- `eslint --fix`, `prettier --write` on broad paths
- `npm run build` (production packager)
- `docker compose down -v` (data loss)

See [commands-requiring-confirmation.md](../agent-cli-hub/references/commands-requiring-confirmation.md).

## Troubleshooting

- **tsc errors in electron only:** run `npx tsc -p electron/tsconfig.json --noEmit` separately from renderer.
- **Tests fail on DB:** expected if PostgreSQL/backend unreachable — document blocker; UI tests may still pass in isolation.
- **Lint pre-existing errors:** note in PR; do not fix unrelated files unless asked.

## Verification checklist

```bash
npm run lint
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npm run test:run
```
