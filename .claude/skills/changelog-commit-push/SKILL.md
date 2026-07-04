---
name: changelog-commit-push
description: Updates CHANGELOG.md from git changes, commits, and pushes. Use when the user asks to update changelog, commit and push, or ship changes.
---

# Changelog, Commit & Push Workflow

## When to Use

Apply this skill when the user explicitly asks to:
- Update changelog and commit/push
- Ship changes
- Release or publish changes

## Workflow

### 1. Analyze Changes

Run `git status --short` and `git diff --stat` to understand what changed. Read key diffs if needed.

### 2. Update CHANGELOG.md

- Add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top (below the header).
- Use today's date.
- Bump version: patch (Z) for fixes, minor (Y) for features, major (X) for breaking changes.
- Group entries under: `### Added`, `### Changed`, `### Fixed`, `### Removed`.
- Follow existing style: bold feature names, concise bullets.

**Template:**
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- **Feature name**: Brief description.

### Changed
- What changed.

### Fixed
- What was fixed.
```

### 3. Bump package.json version

If CHANGELOG version differs from `package.json`, update `package.json` to match.

### 4. Commit and Push

```bash
git add CHANGELOG.md package.json
# Add other changed files the user intends to ship
git add -A  # or specific paths
git commit -m "chore: release vX.Y.Z"
git push
```

Use conventional commit: `chore:`, `feat:`, `fix:` as appropriate.

## Notes

- Do not commit unless the user explicitly requested it.
- Ask before pushing if remote might have conflicts.
- Exclude temporary files (e.g. `verify.js`, `*.log`) from commits unless intentional.
