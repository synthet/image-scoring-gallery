> **Claude Code:** Same intent as Cursor `/wiki-lint`. When customizing, keep in sync with `.cursor/commands/wiki-lint.md`.

# /wiki-lint — Health-check the docs wiki

Use for periodic maintenance or when docs feel stale or disorganized. Finds structural issues and optionally fixes them.

## Inputs

- Optional scope: a specific category (e.g., `architecture/`) or `full` (default: full).
- Optional: user can request fixes be applied automatically.

## Steps

1. **Orphan scan** — List all `.md` files under `docs/`. Check each against `docs/README.md` index entries. Report pages not listed in the index.
2. **Broken links** — Scan all pages for markdown links. Verify link targets exist (relative paths resolved from the linking file). Report broken links.
3. **Cross-reference gaps** — For each page, check if pages it references also reference it back. Report one-way references that should be bidirectional.
4. **Staleness check** — Pages with date references or version numbers: flag if the date is more than 3 months old or the version does not match current `package.json`.
5. **Contradiction scan** — Compare key facts across pages (tech stack versions, architecture claims, feature status). Flag conflicts.
6. **Category README check** — Each subdirectory should have a README.md or be listed in the parent index. Report missing.
7. **Log coverage** — Check if recent git commits touching `docs/` have corresponding `docs/log.md` entries.
8. **Report** findings grouped by severity: broken > orphan > stale > gap.
9. If user approves fixes: apply corrections (add to index, fix links, update cross-references, add log entries).

## Done when

- Report is produced with all findings categorized.
- If fix mode: all fixable issues are resolved, index and log updated.

## Checklist

- [ ] All pages accounted for in `docs/README.md` index
- [ ] No broken internal links
- [ ] `docs/log.md` is current
- [ ] Findings reported with severity levels
