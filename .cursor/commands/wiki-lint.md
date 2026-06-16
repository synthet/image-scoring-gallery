# /wiki-lint — Health-check the docs wiki

Use for periodic maintenance or when docs feel stale or disorganized. Finds structural issues and optionally fixes them.

## Inputs

- Optional scope: a specific category (e.g., `architecture/`) or `full` (default: full).
- Optional: user can request fixes be applied automatically.

## Steps

0. **Run automated OKF lint** (from sibling **image-scoring-backend** repo root):
   - `python scripts/okf_lint.py ../image-scoring-gallery/docs --profile vexlum --bundle-name docs`
   Use findings as the starting point for manual review below.

1. **Orphan scan** — List all `.md` files under `docs/`. Check each against `docs/README.md` index entries. Report pages not listed in the index.
2. **OKF frontmatter scan** — Verify every `docs/**/*.md` page has `type`, `title`, `description`, `resource`, `tags`, `timestamp`; confirm `resource` matches the repository-relative path.
3. **Broken links** — Scan all pages for markdown links. Verify link targets exist (relative paths resolved from the linking file). Report broken links.
4. **Cross-reference gaps** — For each page, check if pages it references also reference it back. Report one-way references that should be bidirectional.
5. **Staleness check** — Pages with date references or version numbers: flag if the date is more than 3 months old or the version does not match current `package.json`.
6. **Contradiction scan** — Compare key facts across pages (tech stack versions, architecture claims, feature status). Flag conflicts.
7. **Category README check** — Each subdirectory should have a README.md or be listed in the parent index. Report missing.
8. **Log coverage** — Check if recent git commits touching `docs/` have corresponding `docs/log.md` entries.
9. **Report** findings grouped by severity: broken > invalid OKF metadata > orphan > stale > gap.
10. If user approves fixes: apply corrections (frontmatter, index entries, links, cross-references, log entries).

## Done when

- Report is produced with all findings categorized.
- If fix mode: all fixable issues are resolved, index and log updated.

## Checklist

- [ ] All pages accounted for in `docs/README.md` index
- [ ] OKF frontmatter exists, has required fields, and `resource` paths match files
- [ ] No broken internal links
- [ ] `docs/log.md` is current
- [ ] Findings reported with severity levels
