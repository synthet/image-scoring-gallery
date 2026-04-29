# Release (gallery)

Run a **semver release** for **this repo** (`image-scoring-gallery` / **Driftara Gallery**): bump version from the **majority** of change types, update `CHANGELOG.md`, commit, and push.

## Before you start

- Apply the **`changelog-commit-push`** skill (`.cursor/skills/changelog-commit-push/SKILL.md`) for changelog style and commit conventions.
- Do **not** commit junk (`tmp/`, `*.log`, `lint_output*.txt`, secrets). Stage only intentional release files.

## 1. Inspect what will ship

- `git status --short` and `git diff --stat` (and `git diff` for substantive edits if needed).
- Current version: `package.json` → `"version"`.
- Latest changelog heading: top `## [X.Y.Z]` in `CHANGELOG.md`.

## 2. Choose the next semver (majority rule)

Classify **uncommitted** (or user-specified) work into:

| Kind | Examples |
|------|----------|
| **Breaking** | Removed API/IPC, incompatible DB expectations, renamed user-facing behavior |
| **Feature** | New UI, new IPC, new scripts, meaningful behavior additions |
| **Fix** | Bug fixes, corrections |
| **Chore** | Docs-only, typos, internal refactors with no user-visible change |

**Bump rules (apply in order):**

1. If there is **any** breaking item → **major** (`X+1.0.0`).
2. Else tally **feature** vs **fix** (ignore pure **chore** unless there is nothing else). If **feature count ≥ fix count** and **feature count ≥ 1** → **minor** (`x.Y+1.0`). If **fix count > feature count** → **patch** (`x.y.Z+1`).
3. If only chore/docs → **patch**.

If the user stated a level (`major` / `minor` / `patch`), use that instead.

## 3. Edit files

- **`CHANGELOG.md`**: Insert `## [newVersion] - YYYY-MM-DD` directly under the file header block (below the intro lines), with `### Added` / `### Changed` / `### Fixed` / `### Removed` as needed. Match existing tone: bold labels, short bullets.
- **`package.json`**: Set `"version"` to **newVersion** (must match the changelog entry).

## 4. Commit and push

```bash
git add CHANGELOG.md package.json
# plus any other files that are part of this release, if already reviewed
git commit -m "chore: release v<newVersion>"
git push
```

If push fails (e.g. non-fast-forward), fetch/rebase or merge as appropriate, then push again. Summarize what shipped and the version for the user.
