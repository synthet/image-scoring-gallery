---
name: mcp-code-intelligence
description: >-
  Compare MCP code-intelligence layers — CLI wrappers, ast-grep, symbol/graph
  tools, Zoekt, embeddings. Use when choosing search/dispatch vs heavyweight
  indexes. Gallery domain MCP is image-scoring-mcp (is-ui-mcp).
---

# MCP code intelligence

Compare approaches for giving coding agents repository awareness.

## Purpose

Choose the lightest effective layer: CLI tools first, structural MCP second, graph/embedding indexes last.

## When to use

- Evaluating whether to add an MCP server vs using `rg`/`fd`
- Debugging agent search quality or memory use
- Complementing (not replacing) gallery [`image-scoring-mcp`](../image-scoring-mcp/SKILL.md)

## Required tools

Depends on tier — baseline CLI from [agent-cli-hub](../agent-cli-hub/SKILL.md).

## Recommended tiers

### Minimal MCP setup

```text
rg + fd + read_file + git diff + patch_file
```

Lowest memory, transparent, deterministic. Best default for most tasks.

### Better setup

```text
fff-gallery MCP (ffgrep, fffind) + rg + fd + ast-grep + git tools + task runner (npm run / just)
```

Adds indexed, frecency-ranked search for long agent sessions; keep `rg`/`fd` for one-off shell use.

### Advanced setup

```text
Graphify (graphify query/path/explain or optional graphify-gallery MCP) + optional Serena / Zoekt / embeddings
```

Higher setup cost. Prefer **Graphify** for local AST knowledge graphs (no vector store) before heavier symbol/embedding indexes. Use when cross-module “why / how connected” questions outgrow `rg`/`fff`.

**Warning:** Embedding-first indexing is often heavier and less exact than text/structural search — keep it secondary. Do **not** use Graphify for gallery IPC/backend triage — that stays on **`is-ui-mcp`**.

## Comparison matrix

| Layer | Examples | Strengths | Cost |
|-------|----------|-----------|------|
| Indexed file search | **fff** MCP (`ffgrep`, `fffind`) — project `fff-gallery` | Warm index, frecency, git-aware, typo-tolerant | Project MCP install; ~26 MB RAM / 14k files |
| CLI wrappers | rg, fd, bat, git diff | Fast, bounded, no index | Agent must orchestrate |
| Structural | ast-grep MCP/CLI, semgrep | Syntax shapes, rewrites | Medium; language-aware |
| Symbol | universal-ctags, LSP | Definitions/refs | Index refresh on change |
| Knowledge graph | **Graphify** (`graphifyy` CLI; optional `graphify-gallery` MCP) | AST edges, path/query/explain; local, no vectors | `uv tool install`; build `graphify-out/` |
| Graph | Serena, codebase-memory-mcp | Project memory, relationships | Setup + memory |
| Trigram index | Zoekt | Large-repo search | Server/wrapper overhead |
| Embeddings | claude-context-style | Fuzzy discovery | Heavy index, imprecise |

## Gallery domain MCP

For **Driftara Gallery** pipeline, IPC, and backend reachability — use compact **`search` + `dispatch`** on **`is-ui-mcp`** (stdio) and optional **`is-ui-live`** (SSE when Electron dev runs).

See [`image-scoring-mcp`](../image-scoring-mcp/SKILL.md) and [AGENTS.md](../../../AGENTS.md).

Backend triage: sibling workspace **`is-be-mcp`**.

## Agent-safe patterns

- Start with Minimal tier; escalate only when text search fails repeatedly.
- Do not enable embedding indexes on every session — confirm with user.
- Bound MCP tool output; prefer dispatch actions with `limit` parameters.

## Commands requiring confirmation

- Installing/running new MCP servers that execute shell or network code
- Embedding index builds over entire monorepo without scope

See [commands-requiring-confirmation.md](../agent-cli-hub/references/commands-requiring-confirmation.md).

## Troubleshooting

- **MCP load failures:** build `mcp-server/` (`npm run build:registry`); check `.cursor/mcp.json` from `mcp.example.json`.
- **live_unavailable:** Electron not running — use `is-ui-mcp` local actions or start dev with CDP.

## Verification checklist

```bash
# Gallery MCP built
test -f mcp-server/dist/compactIndex.js && echo ok
# CLI baseline
rg --version && fd --version
```

Tools not verified in this pass: Graphify MCP (`graphifyy[mcp]`), Serena, codebase-memory-mcp, Zoekt server, claude-context — treat as optional third-party; confirm upstream docs before install. See [AGENTS.md § Graphify](../../../AGENTS.md).
