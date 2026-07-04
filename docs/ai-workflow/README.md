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
| Claude mirror | `.claude/{commands,skills,agents,rules}` | **Partial** mirror for harness-visible assets |
| MCP template | `.cursor/mcp.example.json` | Copy to gitignored `.cursor/mcp.json` |
| Agent governance | `.agent/` | Safety, inventory, subagent role matrix, workflow playbooks |
| Workflow playbooks | `.agent/workflows/*.md` | Electron dev, IPC, backend connection, … |

**Canonical tree:** **`.cursor/`** for gallery agent assets. Generic patterns upstream: [synthet-code-framework](https://github.com/synthet/synthet-code-framework); domain fork with backend coordination — see [backend docs/ai-workflow/README.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/ai-workflow/README.md).

### Skill clusters

| Cluster | Skills | When |
|---------|--------|------|
| **SDLC / governance** | `backlog-queue`, `validate-implementation`, `commit-conventions`, `eval`, … | Every task, PR, spec |
| **Domain (gallery)** | `gallery-electron-ts`, `gallery-ui`, `image-scoring-mcp`, `codebase-size-audit`, … | Electron, UI, MCP triage |
| **Generic CLI** | `agent-cli-hub` → `agent-search`, `agent-git-workflows`, `agent-data-config`, `agent-dev-tooling`, `agent-platform-tooling`, `mcp-code-intelligence` | Shell navigation, git, lint/tsc, Windows/WSL |

Start generic CLI work at **`agent-cli-hub`**.

**Upstream:** [synthet-code-framework](https://github.com/synthet/synthet-code-framework) ships a **flat 13-skill** CLI layout (`.claude/skills/`); this gallery uses the **consolidated hub** (7 skills). Cherry-pick content from framework; do not replace the hub layout blindly. Validate hub skills: `python scripts/validate_cli_hub_skills.py` — see [`.agent/cli-tools-skills-spec.md`](../../.agent/cli-tools-skills-spec.md).

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

## Safety

All of the above operate under [`.agent/SAFETY.md`](../../.agent/SAFETY.md).
