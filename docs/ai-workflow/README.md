---
type: Documentation Hub
title: AI Workflow & Asset Map
description: Where every agent asset lives (rules, commands, skills, agents, workflows) and the SDLC loop they support.
resource: ai-workflow/README.md
tags: [docs, agents, workflow]
timestamp: 2026-07-03T00:00:00Z
okf_version: 0.1
---

# AI workflow & asset map

## Where agent assets live

| Asset | Location | Notes |
|-------|----------|-------|
| Cursor commands | `.cursor/commands/*.md` | **Canonical** authoring source |
| Cursor skills | `.cursor/skills/*/SKILL.md` | **Canonical** authoring source |
| Cursor subagents | `.cursor/agents/*.md` | **Canonical** authoring source |
| Cursor rules | `.cursor/rules/*.mdc` | Always-on or glob-scoped guidance |
| Claude mirror | `.claude/{commands,skills,agents,rules}` | **Generated** from `.cursor/` — run `python scripts/sync_assistant_trees.py` |
| MCP template | `.cursor/mcp.example.json` | Copy to gitignored `.cursor/mcp.json` |
| Agent governance | `.agent/` | Safety, inventory, subagent role matrix, workflow playbooks |
| Project memory | `.agent-memory/` | log → dream → promote (scripts in sibling backend — see `CURSOR_USAGE.md`) |
| Workflow playbooks | `.agent/workflows/*.md` | Electron dev, IPC, backend connection, … |

**Single source of truth:** edit assets under **`.cursor/`** + **`.agent/`**, then run
`python scripts/sync_assistant_trees.py` to regenerate the `.claude/` mirror.

**Upstream:** [synthet-code-framework](https://github.com/synthet/synthet-code-framework); domain fork — see [backend framework-adoption-port-manifest](https://github.com/synthet/image-scoring-backend/blob/main/docs/raw/framework-adoption-port-manifest.md) and [backend docs/ai-workflow/README.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/ai-workflow/README.md).

### Skill clusters

| Cluster | Skills | When |
|---------|--------|------|
| **SDLC / governance** | `backlog-queue`, `validate-implementation`, `commit-conventions`, `eval`, … | Every task, PR, spec |
| **Domain (gallery)** | `gallery-electron-ts`, `gallery-ui`, `image-scoring-mcp`, `codebase-size-audit`, … | Electron, UI, MCP triage |
| **Generic CLI** | `agent-cli-hub` → `agent-search`, `agent-git-workflows`, `agent-data-config`, `agent-dev-tooling`, `agent-platform-tooling`, `mcp-code-intelligence` | Shell navigation, git, lint/tsc, Windows/WSL |

Start generic CLI work at **`agent-cli-hub`**.

Validate hub skills: `python scripts/validate_cli_hub_skills.py` — see [`.agent/cli-tools-skills-spec.md`](../../.agent/cli-tools-skills-spec.md).

## Framework alignment

Cursor-first + 7-skill CLI hub (approved fork). CI: [`.github/workflows/agent-infra.yml`](../../.github/workflows/agent-infra.yml).

```bash
python scripts/sync_assistant_trees.py --check
python scripts/validate_cli_hub_skills.py
python scripts/ci/check_agent_frontmatter.py
python scripts/ci/check_secrets.py
```

## The SDLC loop

```
/spec  →  /plan  →  /implement  →  /test-and-fix  →  validate-implementation  →  /pr-ready  →  (optional) /run-subagent-review  →  /release-notes
```

### Phase gates

| Phase | Artifact produced | Gate to pass before the next phase |
|-------|-------------------|-------------------------------------|
| `/spec` | Spec with EARS `AC-n` acceptance criteria | User approves; no criterion is AMBIGUOUS |
| `/plan` | Implementation plan (files, approach, tests, rollback) | User approves the plan |
| `/implement` | Minimal-diff change set with tests | Lint + `npm run test:run` + tsc green |
| `/test-and-fix` | Green test run (or written blocker) | Tests pass or blocker documented |
| `validate-implementation` (skill) | Per-AC Verified/Failed/Unknown report with evidence | Every AC Verified, or open items accepted by the user |
| `/pr-ready` | Definition-of-done report + paste-ready PR text | Checks green, `Closes #<N>`, card in `Stage = Review` |

- **Backlog first:** [backlog contract](project/00-backlog-workflow.md) (`/task-claim`).
- **Review:** `/check-subagents` + `/run-codex-review` / `/run-gemini-review` for external second opinions.
- **Docs:** `/wiki-ingest`, `/wiki-lint`, `/wiki-query` (see [WIKI_SCHEMA](WIKI_SCHEMA.md)).
- **Memory:** `/log-session` → `/dream-memory` → `/promote-memory` → `/memory-context` (scripts in sibling backend).

## Safety

All of the above operate under [`.agent/SAFETY.md`](../../.agent/SAFETY.md) and the always-on **`safety-and-secrets`** rule.
