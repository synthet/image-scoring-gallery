# /release — Release (gallery)

Run a **semver release** for **this repo** (`image-scoring-gallery` / **Driftara Gallery**)
via the compiled harness. Do **not** re-derive version/changelog paths by hand.

## Before you start

- Apply **`changelog-commit-push`** (`.cursor/skills/changelog-commit-push/SKILL.md`).
- Do **not** commit junk (`tmp/`, `*.log`, `gallery-mcp.lock`, secrets).

## 1. Inspect

```powershell
python scripts/agent_skills/release_bump.py inspect
```

- If `needs_human_confirm_branch` is true — **stop** and confirm the branch with
  the user before apply/commit (unless they already named this branch for release).
- If `needs_llm_judgment` is true — classify uncommitted / recent git history as
  feature vs fix vs breaking, then choose `--level`.

## 2. Plan (optional) and apply

```powershell
python scripts/agent_skills/release_bump.py plan --level minor   # or major|patch
python scripts/agent_skills/release_bump.py apply --level minor
# feature branch after human confirm:
python scripts/agent_skills/release_bump.py apply --level minor --allow-non-main-branch
```

Harness writes `package.json` + `CHANGELOG.md` only. It never commits or pushes.

## 3. Commit and push (human-gated)

Only when the user asked to commit/push:

```bash
git add CHANGELOG.md package.json
# plus any other intentional release files
git commit -m "chore: release v<newVersion>"
git push
```

Summarize what shipped and the version for the user.
