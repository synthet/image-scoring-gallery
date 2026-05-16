# Subagents and logical roles — image-scoring-gallery

Physical definitions: [`.cursor/agents/`](../.cursor/agents/), mirrored to [`.claude/agents/`](../.claude/agents/).

## Role matrix

| Logical role | Concrete subagent / skill | Responsibility | Canonical sources |
|--------------|---------------------------|----------------|-------------------|
| gallery-electron-agent | [`gallery-electron-ts`](../.cursor/agents/gallery-electron-ts.md), [`gallery-electron-ts` skill](../.cursor/skills/gallery-electron-ts/SKILL.md) | Main/preload, Vite, `db.ts` contract | [docs/CANONICAL_SOURCES.md](../docs/CANONICAL_SOURCES.md), [electron/](../electron/) |
| gallery-ipc-agent | `gallery-electron-ts` | IPC handlers, preload, `src/electron.d.ts` | `electron/main.ts`, `electron/preload.ts` |
| gallery-api-client-agent | `gallery-electron-ts` | HTTP client to backend | [electron/apiService.ts](../electron/apiService.ts), backend API_CONTRACT |
| gallery-raw-preview-agent | `gallery-electron-ts` | NEF/RAW, orientation | [docs/CANONICAL_SOURCES.md](../docs/CANONICAL_SOURCES.md) RAW rows; regression tests required |
| gallery-ui-agent | `gallery-electron-ts` | React components, `src/` | Existing patterns, design tokens |
| gallery-docs-agent | [`docs-wiki` skill](../.cursor/skills/docs-wiki/SKILL.md) | `docs/`, log, indexes | [docs/WIKI_SCHEMA.md](../docs/WIKI_SCHEMA.md) |
| gallery-mcp-debug (triage) | [`gallery-mcp-debug`](../.cursor/agents/gallery-mcp-debug.md) | Reachability, CDP, local status | [AGENTS.md](../AGENTS.md) |
| cross-repo-integration-agent | `gallery-electron-ts` + backend handoff | Contract order, types sync | [Backend AGENT_COORDINATION](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) |

## Allowed vs forbidden

| Role | Allowed | Forbidden |
|------|---------|-----------|
| Electron / TS | IPC-safe main-process DB/fs; renderer via `window.electronAPI` | Direct `pg` import or `node:fs` from React components |
| API client | Changes to `apiService.ts` matching backend contract | Invented paths or fields not in OpenAPI/API_CONTRACT |
| Docs | Relative in-repo links; GitHub URLs to backend authority | Duplicating full backend schema in gallery |

## Validation commands

- `npx tsc --noEmit`
- `npx tsc -p electron/tsconfig.json --noEmit`
- `npm run lint`
- `npm run test:run` when behavior changes
- `npm run doctor` for connectivity sanity

## Handoff

- Backend schema/API changes: complete [cross_repo_contract_change.md](workflows/cross_repo_contract_change.md) backend steps first, then `npm run contract:check` / update types here.
