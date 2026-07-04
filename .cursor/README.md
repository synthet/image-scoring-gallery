# Cursor agent setup — image-scoring-gallery

Project-local configuration for Cursor IDE agents. **Authority:** [AGENTS.md](../AGENTS.md), [.agent/AGENT_INFRA_INVENTORY.md](../.agent/AGENT_INFRA_INVENTORY.md).

## Layout

| Path | Role |
|------|------|
| [`rules/`](rules/) | Always-on or glob-scoped rules (`.mdc`). Canonical. |
| [`commands/`](commands/) | Slash commands (`/spec`, `/plan`, `/implement`, `/pr-ready`, …). Partial mirror to [`.claude/commands/`](../.claude/commands/). |
| [`skills/`](skills/) | **Canonical** project skills. Partial mirror to [`.claude/skills/`](../.claude/skills/) for harness-visible skills. **CLI cluster:** `agent-cli-hub` (+ references), `agent-search`, `agent-git-workflows`, `agent-data-config`, `agent-dev-tooling`, `agent-platform-tooling`, `mcp-code-intelligence`. |
| [`agents/`](agents/) | Subagent role definitions. Mirror to [`.claude/agents/`](../.claude/agents/). |
| [`mcp.example.json`](mcp.example.json) | **Template** — copy to gitignored `.cursor/mcp.json`. |

## MCP setup

1. Copy **`mcp.example.json`** → **`.cursor/mcp.json`**.
2. Attach **`is-ui-mcp`** (stdio) for **`search`** + **`dispatch`**.
3. Optional **`is-ui-live`** (SSE) when Electron dev is running.

Backend pipeline triage: sibling **image-scoring-backend** workspace with **`is-be-mcp`**.

User **`~/.cursor/mcp.json`**: **`github`**, **`subagent-orchestrator`**, etc. — see [`mcp.user.example.json`](mcp.user.example.json). Optional **`fff-gallery`** is **project-level** in `.cursor/mcp.json` — see [AGENTS.md § fff](../AGENTS.md).

## Also use

- [`.agent/workflows/`](../.agent/workflows/) — Electron dev, IPC, backend connection runbooks.
- [docs/ai-workflow/README.md](../docs/ai-workflow/README.md) — SDLC loop and phase gates.
- Backend AST10 checklist: [../image-scoring-backend/.agent/SKILL_CHANGE_AST10_REVIEW.md](../image-scoring-backend/.agent/SKILL_CHANGE_AST10_REVIEW.md).

## Slash commands (this repo)

| Command | Purpose |
|---------|---------|
| `/spec` | Feature/change spec with EARS `AC-n` criteria |
| `/plan` | Implementation plan (after spec) |
| `/decompose` | Break large epics into parallel subtasks |
| `/implement` | Execute approved plan |
| `/test-and-fix` | Run tests, fix failures |
| `/pr-ready` | Merge-ready summary + PR body |
| `/task-claim` | Claim GitHub Project board issue |
| `/release-notes` | Changelog / release notes |
| `/wiki-ingest`, `/wiki-lint`, `/wiki-query` | Docs wiki maintenance |
| `/check-subagents`, `/run-*-review` | External Codex/Gemini review (MCP) |

## Drift checklist (maintainers)

1. Skills with Claude mirror stay in sync (see [.agent/SKILL_INVENTORY.md](../.agent/SKILL_INVENTORY.md)).
2. Cherry-pick generic agent improvements from sibling [image-scoring-backend](../image-scoring-backend) or [synthet-code-framework](https://github.com/synthet/synthet-code-framework); adapt domain paths.
3. Bump inventory **Last reviewed** dates when skills change.
