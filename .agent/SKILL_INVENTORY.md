# Agent skill inventory (AST09)

Central list of **first-party** `SKILL.md` files in **image-scoring-gallery** for governance. Aligns with [OWASP Agentic Skills Top 10 — AST09](https://github.com/kenhuangus/agentic-skills-top-10#ast09--no-governance).

**PR review prompts:** Use the same first-party checklist as the backend: [../image-scoring-backend/.agent/SKILL_CHANGE_AST10_REVIEW.md](../image-scoring-backend/.agent/SKILL_CHANGE_AST10_REVIEW.md) when both repos are sibling checkouts.

**Upstream checklist:** [agentic-skills-top-10/checklist.md](https://github.com/kenhuangus/agentic-skills-top-10/blob/main/checklist.md)

## Risk tier (informal)

| Tier | Meaning |
|------|--------|
| **L1** | Narrow guidance; no destructive defaults |
| **L2** | Changelog / git / push workflows — verify no credential exfil patterns |

## Cursor project skills

| Skill `name` | Path | Purpose (short) | Risk | Claude mirror | Last reviewed |
|--------------|------|-----------------|------|---------------|---------------|
| backlog-queue | `.cursor/skills/backlog-queue/SKILL.md` | Cross-repo GitHub Project board contract (claim, transition, file) | L1 | Yes | 2026-04-28 |
| changelog-commit-push | `.cursor/skills/changelog-commit-push/SKILL.md` | CHANGELOG, commit, push | L2 | — | 2026-04-25 |
| commit-conventions | `.cursor/skills/commit-conventions/SKILL.md` | Conventional Commits / PR titles | L1 | — | 2026-04-25 |
| docs-wiki | `.cursor/skills/docs-wiki/SKILL.md` | OKF-style `docs/` wiki conventions | L1 | — | 2026-06-16 |
| eval | `.cursor/skills/eval/SKILL.md` | Capture task quality signals (test_pass_rate / first_try_success / iteration_count) → agent-memory feedback loop | L1 | Yes | 2026-06-19 |
| gallery-electron-ts | `.cursor/skills/gallery-electron-ts/SKILL.md` | Electron / TS / db contract | L1 | — | 2026-04-25 |
| gallery-ui | `.cursor/skills/gallery-ui/SKILL.md` | Renderer UI, CSS Modules, design tokens | L1 | — | 2026-06-21 |
| security-review | `.cursor/skills/security-review/SKILL.md` | Pre-merge security sanity | L1 | — | 2026-04-25 |
| subagent-review | `.cursor/skills/subagent-review/SKILL.md` | External Codex/Gemini review via subagent-orchestrator MCP | L2 | Yes | 2026-05-26 |

**Note:** Most skills here are Cursor-only. **`backlog-queue`** is mirrored under `.claude/skills/` and `.agent/skills/` because it gates every task — agent harnesses must see it regardless of which loader they use.

## `.agent/skills/` (third-party-agent mirror)

| Skill `name` | Path | Purpose (short) | Risk | Last reviewed |
|--------------|------|-----------------|------|---------------|
| gallery-ui | `.agent/skills/gallery-ui/SKILL.md` | Alias → `.cursor/skills/gallery-ui` | L1 | 2026-06-21 |
| backlog-queue | `.agent/skills/backlog-queue/SKILL.md` | Project board contract (Antigravity / generic agent mirror of canonical Cursor skill) | L1 | 2026-04-28 |

## Subagents (Cursor / Claude Code)

Project subagents live under **`.cursor/agents/`** (canonical) and are mirrored to **`.claude/agents/`** for Claude Code parity.

| Subagent `name` | Path | Purpose (short) | Risk | Claude mirror | Last reviewed |
|-----------------|------|-----------------|------|---------------|---------------|
| gallery-electron-ts | `.cursor/agents/gallery-electron-ts.md` | Electron / TS / db.ts contract; aligns with backend schema | L2 | Yes | 2026-05-15 |
| gallery-mcp-debug | `.cursor/agents/gallery-mcp-debug.md` | Read-only triage from gallery: gallery-local vs reachability vs backend-internal | L1 | Yes | 2026-05-15 |
| pr-ready-hygiene | `.cursor/agents/pr-ready-hygiene.md` | Scoped lint/tests/tsc; PR-ready checklist | L2 | Yes | 2026-05-15 |
| external-codex-review | `.cursor/agents/external-codex-review.md` | Codex-only external CLI review (MCP) | L2 | Yes | 2026-05-26 |
| external-gemini-review | `.cursor/agents/external-gemini-review.md` | Gemini-only external CLI review (MCP) | L2 | Yes | 2026-05-26 |
| external-cli-reviewer | `.cursor/agents/external-cli-reviewer.md` | Detect + run + panel-style external reviews | L2 | Yes | 2026-05-26 |
