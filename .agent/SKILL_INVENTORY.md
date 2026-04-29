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
| changelog-commit-push | `.cursor/skills/changelog-commit-push/SKILL.md` | CHANGELOG, commit, push | L2 | — | 2026-04-25 |
| commit-conventions | `.cursor/skills/commit-conventions/SKILL.md` | Conventional Commits / PR titles | L1 | — | 2026-04-25 |
| docs-wiki | `.cursor/skills/docs-wiki/SKILL.md` | `docs/` wiki conventions | L1 | — | 2026-04-25 |
| gallery-electron-ts | `.cursor/skills/gallery-electron-ts/SKILL.md` | Electron / TS / db contract | L1 | — | 2026-04-25 |
| security-review | `.cursor/skills/security-review/SKILL.md` | Pre-merge security sanity | L1 | — | 2026-04-25 |

**Note:** This repo does not mirror skills under `.claude/skills/` today; **`.cursor/skills/`** is the single copy (AST10 drift risk is lower than backend, which maintains Cursor + Claude pairs).
