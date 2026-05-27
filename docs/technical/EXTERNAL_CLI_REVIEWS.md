# External CLI reviews (subagent-orchestrator)

Optional **review-only** second opinions from **Codex** or **Gemini CLI** for this gallery workspace.

## Setup

Same as the backend doc: sibling **`../subagent-orchestrator`**, build `agent-orchestrator`, reload MCP.

**Canonical setup and safety:** [image-scoring-backend EXTERNAL_CLI_REVIEWS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/EXTERNAL_CLI_REVIEWS.md) (or `../image-scoring-backend/docs/technical/EXTERNAL_CLI_REVIEWS.md` when cloned as siblings).

## MCP in this repo

| Key | Purpose |
|-----|---------|
| `imgscore-el-subagent-orchestrator` | `detect_subagents`, `run_subagent` |

Outputs: **`.agent-runs/`** under this repo (gitignored).

## Slash commands

`/check-subagents`, `/run-codex-review`, `/run-gemini-review`, `/run-subagent-review` — see [AGENTS.md](../../AGENTS.md).

Prefer reviewing `electron/`, `src/`, and `mcp-server/` paths; avoid end-user photo library paths unless explicitly requested.

## Safety

See [.agent/SAFETY.md](../../.agent/SAFETY.md) and the backend EXTERNAL_CLI_REVIEWS doc above.
