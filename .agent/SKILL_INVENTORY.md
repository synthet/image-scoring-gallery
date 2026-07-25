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
| image-scoring-mcp | `.cursor/skills/image-scoring-mcp/SKILL.md` | Compact MCP search/dispatch for gallery | L2 | — | 2026-07-01 |
| codebase-size-audit | `.cursor/skills/codebase-size-audit/SKILL.md` | Large-file / long-method read-only audit | L1 | — | 2026-07-01 |
| validate-implementation | `.cursor/skills/validate-implementation/SKILL.md` | Per-AC Verified/Failed/Unknown gate before /pr-ready | L1 | — | 2026-07-01 |
| threat-modeling-agentic-tools | `.cursor/skills/threat-modeling-agentic-tools/SKILL.md` | MCP/hook/prompt-injection threat modeling | L1 | — | 2026-07-01 |
| mcp-server-design | `.cursor/skills/mcp-server-design/SKILL.md` | Safe MCP server design for `mcp-server/` | L1 | — | 2026-07-01 |
| agent-memory | `.cursor/skills/agent-memory/SKILL.md` | Log/dream/promote via sibling backend scripts | L2 | Yes | 2026-07-04 |
| agent-cli-hub | `.cursor/skills/agent-cli-hub/SKILL.md` | CLI skill router; install tiers, agent-environment, shared references | L1 | Yes | 2026-07-21 |
| agent-search | `.cursor/skills/agent-search/SKILL.md` | rg/grep/ast-grep/fd tool selection + fff + Graphify | L1 | Yes | 2026-07-21 |
| agent-git-workflows | `.cursor/skills/agent-git-workflows/SKILL.md` | git/gh safe status, diff, PR workflows | L2 | Yes | 2026-07-04 |
| agent-data-config | `.cursor/skills/agent-data-config/SKILL.md` | jq/yq/curl config and API inspection | L1 | Yes | 2026-07-04 |
| agent-dev-tooling | `.cursor/skills/agent-dev-tooling/SKILL.md` | Gallery npm lint/tsc/vitest; optional backend tools | L1 | Yes | 2026-07-04 |
| agent-platform-tooling | `.cursor/skills/agent-platform-tooling/SKILL.md` | Windows vs WSL2 environment choice | L1 | Yes | 2026-07-04 |
| mcp-code-intelligence | `.cursor/skills/mcp-code-intelligence/SKILL.md` | MCP vs CLI code-intelligence tiers; fff + Graphify | L1 | Yes | 2026-07-21 |
| graphify | `.cursor/skills/graphify/SKILL.md` | Graphify MCP (`graphify-gallery`) + CLI for architecture / connectivity | L1 | Yes | 2026-07-21 |
| karpathy-guidelines | `.cursor/skills/karpathy-guidelines/SKILL.md` | Deliberate coding checklist (pairs with karpathy-coding rule) | L1 | Yes | 2026-07-21 |
| systematic-debugging | `.cursor/skills/systematic-debugging/SKILL.md` | Evidence-first root-cause before guess-and-check fixes | L2 | Yes | 2026-07-21 |
| test-driven-development | `.cursor/skills/test-driven-development/SKILL.md` | Red-green-refactor; fail-first tests | L1 | Yes | 2026-07-21 |
| verification-before-completion | `.cursor/skills/verification-before-completion/SKILL.md` | Fresh command evidence before "done" claims | L1 | Yes | 2026-07-21 |
| skill-authoring | `.cursor/skills/skill-authoring/SKILL.md` | Create/improve Cursor-canonical skills + sync | L1 | Yes | 2026-07-21 |
| critical-commit-audit | `.cursor/skills/critical-commit-audit/SKILL.md` | High-severity post-commit review; IPC/preload/API-client path tracing | L2 | Yes | 2026-07-25 |
| lesson-to-skill | `.cursor/skills/lesson-to-skill/SKILL.md` | Turn session corrections, mistakes, and repetitions into enriched or new assets | L1 | Yes | 2026-07-25 |
| autonomous-run-contract | `.cursor/skills/autonomous-run-contract/SKILL.md` | Metric, budget, revert rule, and stop conditions before an unattended or fanned-out run | L1 | Yes | 2026-07-25 |

**Note:** `.cursor/` is canonical; run `python scripts/sync_assistant_trees.py` after skill/command changes to refresh `.claude/` mirror. CI: [`.github/workflows/agent-infra.yml`](../.github/workflows/agent-infra.yml).

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
