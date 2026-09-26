---
description: Workflow for updating changelog, committing, and pushing changes
paths:
  - "CHANGELOG.md"
  - "package.json"
---

# Changelog, Commit & Push

When the user asks to "update changelog; commit and push" or similar:

1. **Apply** the `changelog-commit-push` skill (`.cursor/skills/changelog-commit-push/SKILL.md`).
2. **Execute** the workflow: analyze changes → update CHANGELOG.md → bump version if needed → `git add` → `git commit` → `git push`.
