# Claude Code hooks — Jev agent harness

`.claude/settings.json` (tracked) wires four hooks to the **sibling backend** harness,
`../image-scoring-backend/scripts/agent_harness/hook.py`, with `--repo "$CLAUDE_PROJECT_DIR"` so it
reads this repo's rules and `.agent/jev_harness.json`. Design:
[JEV_AGENT_HARNESS.md](https://github.com/synthet/image-scoring-backend/blob/master/docs/technical/JEV_AGENT_HARNESS.md).

| Event | Matcher | Argument | Effect |
|-------|---------|----------|--------|
| `UserPromptSubmit` | — | `user-prompt` | Injects intent-scoped rule packs from `.cursor/rules/` at the rung Jev picks (hide / short / full). |
| `SessionStart` | `compact` | `session-compact` | Re-pins the packs that were active before compaction. |
| `PreToolUse` | `Bash` | `pre-bash` | Deterministic deny/ask policy + script inspection; Jev may only escalate. |
| `PreToolUse` | `mcp__.*__run_subagent` | `pre-review` | Blocks restricted files (`config.json`, env, keys) or secret-looking text going to external reviewers. |

Each command is guarded with `test -f … || true`: without the sibling checkout the hooks are skipped
(a bare `python <missing file>` exits 2, which Claude Code treats as *block*).

- All Jev calls off: `JEV_HARNESS_MODE=off` (deterministic policy still runs).
- One decision off: set its mode to `off` in [`.agent/jev_harness.json`](../.agent/jev_harness.json).
- Personal allowlists belong in `.claude/settings.local.json` (gitignored).

`settings.json.example` also carries the optional `PostToolUse` wiki-ingest reminder.
