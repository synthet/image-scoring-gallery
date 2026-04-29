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
