---
type: Documentation Hub
title: AI Workflow & Asset Map
description: Where every agent asset lives (rules, commands, skills, agents, workflows) and the SDLC loop they support.
resource: ai-workflow/README.md
tags: [docs, agents, workflow]
timestamp: 2026-07-01T00:00:00Z
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
