---
description: Run gallery in dev — Vite + Electron + optional backend server
---

## Purpose

Start **Driftara Gallery** for daily development: Vite HMR, Electron, and the small `server` shim from `package.json` scripts.

## When to use

- UI work, IPC debugging with live reload.

## Canonical docs first

- [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md)
- [AGENTS.md](../../AGENTS.md)

## Safe commands (repo root)

```bash
npm install
npm run dev
```

**Web only (no Electron):**

```bash
npm run dev:web
```

**Linux / headless notes** (per AGENTS.md):

```bash
npm run dev:web
npx tsc -p electron/tsconfig.json
ELECTRON_IS_DEV=1 npx electron .
```

## Prerequisites

- Node 18+ (see AGENTS.md for Cloud VM notes).
- PostgreSQL and/or backend API reachable per `config.json` when testing real data.

## Do not

- Do not assume PowerShell-only invocations; prefer repo-relative `npm run` from CWD.
