## Issue

<!-- REQUIRED. Link the backlog issue this PR closes. Format must trigger PR-close automation: -->
Closes #

> If this PR has no associated issue, stop and open one first — the canonical queue is the
> [Project board](https://github.com/users/synthet/projects/1). See
> [`docs/project/00-backlog-workflow.md`](../docs/project/00-backlog-workflow.md).

## Backlog hygiene

- [ ] Card moved to `Stage = Review` on the [Project board](https://github.com/users/synthet/projects/1)
- [ ] If cross-repo, the counterpart issue in `image-scoring-backend` is linked above

## Summary

**What changed:**

## Motivation

<!-- Why is this change needed? Link issues: Fixes # -->

## How to test

<!-- Commands or steps; match AGENTS.md and CLAUDE.md -->

## Checklist

- [ ] No secrets or credentials in code
- [ ] Typecheck / tests as appropriate (`npm run test:run`, `npx tsc --noEmit`, …)

## Skill files (`SKILL.md`) — only if this PR adds or materially changes agent skills

Use the same first-party review list as the backend: [SKILL_CHANGE_AST10_REVIEW.md](https://github.com/synthet/image-scoring-backend/blob/main/.agent/SKILL_CHANGE_AST10_REVIEW.md) (local sibling: `../image-scoring-backend/.agent/SKILL_CHANGE_AST10_REVIEW.md`). Update [.agent/SKILL_INVENTORY.md](../.agent/SKILL_INVENTORY.md).

- [ ] **Inventory:** `.agent/SKILL_INVENTORY.md` updated (new row or **Last reviewed**)
- [ ] **Content review:** Full file read for prose + commands; description matches scope ([OWASP AST10 checklist](https://github.com/kenhuangus/agentic-skills-top-10/blob/main/checklist.md))
