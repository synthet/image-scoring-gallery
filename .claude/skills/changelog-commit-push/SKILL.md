---
name: changelog-commit-push
description: >-
  Update CHANGELOG.md and package.json via compiled release_bump harness, then
  commit/push only when the user asks. Use for /release, changelog updates, or
  shipping gallery versions.
---

# Changelog, commit & push (compiled)

Thin bootloader over `scripts/agent_skills/release_bump.py`. Do **not** re-discover
`package.json` / `CHANGELOG.md` paths or semver math — run the harness.

## When to use

- User asks to update changelog and commit/push
- User runs `/release` or asks to ship / publish gallery changes

## Invoke

```powershell
# 1. Inspect (deterministic; includes branch gate)
python scripts/agent_skills/release_bump.py inspect

# 2. If needs_llm_judgment: classify git history, then pass --level
python scripts/agent_skills/release_bump.py plan --level minor   # or major|patch

# 3. Apply file writes only (no git). On non-main branches, confirm first:
python scripts/agent_skills/release_bump.py apply --level minor
# after human confirm on a feature branch:
python scripts/agent_skills/release_bump.py apply --level minor --allow-non-main-branch
```

## LLM judgment slots

1. When `needs_llm_judgment` is true — classify dirty work / git history as
   feature vs fix vs breaking, then pass `--level`.
2. Draft Unreleased bullets (bold labels, short) when promoting from git history
   rather than an already-filled Unreleased section.

## Human authority

1. If `needs_human_confirm_branch` — stop; confirm the branch before apply/commit
   (not `main`/`master`, and user did not name this branch for release).
2. Commit and push **only** when the user explicitly asks.
3. Exclude junk (`tmp/`, `*.log`, `gallery-mcp.lock`, secrets).

## Semver rubric (encoded in harness; override with `--level`)

1. Breaking / removed → **major**
2. Else if Added count ≥ Fixed and Added ≥ 1 → **minor**
3. Else Fixed-dominant or Changed-only → **patch**

## After apply

- Suggest `chore: release vX.Y.Z` (do not commit unless asked).
- Stage `CHANGELOG.md`, `package.json`, and intentional release files only.

## Related

- Compilation: [`.agent/SKILL_COMPILATION.md`](../../.agent/SKILL_COMPILATION.md)
- Command: [`.cursor/commands/release.md`](../../.cursor/commands/release.md)
