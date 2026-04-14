# /wiki-ingest — Process source material into the docs wiki

Use when new knowledge should be captured in `docs/`: a code change, design decision, feature spec, report, meeting note, or external reference.

## Inputs

- Source material: code diff, spec, decision record, article, or user description.
- Target category if known (architecture, features, guides, reports, planning, technical, project, integration).

## Steps

1. **Read** the source material. Identify what type of wiki content it produces.
2. **Search `docs/`** for related existing pages — prefer updating an existing page over creating a new one.
3. **Discuss with user**: propose new page vs. update, suggested filename, target category, which existing pages need cross-reference updates.
4. **Write or update** the wiki page(s). Follow conventions from the `documentation` rule.
5. **Update `docs/README.md`** index if a new page was created or a page was moved.
6. **Append** an entry to `docs/log.md` with today's date and pages affected.
7. **Add cross-references** in related pages (bidirectional where meaningful).

## Done when

- New content is in the wiki with accurate information.
- `docs/README.md` index is current.
- `docs/log.md` has the new entry.
- Cross-references are bidirectional where appropriate.

## Checklist

- [ ] Page follows naming convention (kebab-case, numbered prefix if in a sequence)
- [ ] Index updated in `docs/README.md`
- [ ] Log entry appended to `docs/log.md`
- [ ] Cross-references added to related pages
- [ ] No orphan pages created (every new page is reachable from the index)
