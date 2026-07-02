---
type: Report
title: Abandoned docs-only branch salvage (July 2026)
description: Wiki ingest record for gallery branches housekeeping/g4-docs-wiki and codex/restructure-docs-using-open-knowledge-format-cmv38j; patches archived under docs/raw/branch-salvage-2026-07/.
resource: docs/reports/09-branch-docs-salvage-2026-07.md
tags: [gallery-docs, reports, housekeeping, okf, branch-cleanup]
timestamp: 2026-07-01T00:00:00Z
okf_version: 0.1
---

# Abandoned docs-only branch salvage (July 2026)

Point-in-time record of **documentation-only** remote branches removed after a branch audit. No open PRs referenced these tips at cleanup time.

**Backend companion:** [image-scoring-backend — BRANCH_DOCS_SALVAGE_2026-07.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/BRANCH_DOCS_SALVAGE_2026-07.md)

## Branches processed

| Branch | Commits (vs merge-base) | Theme | Landed on `main`? |
|--------|-------------------------|-------|------------------|
| `housekeeping/g4-docs-wiki` | 2 | Wiki lint index fixes, README cross-links, historical report banner | **Yes** — content already present on `main` (2026-06-16 OKF pass and later ingests) |
| `codex/restructure-docs-using-open-knowledge-format-cmv38j` | 1 | OKF frontmatter on `docs/**`, agent wiki-ingest/lint command alignment | **Yes** — PR #145 merged; agent workflow/skill OKF sections match `main` |

## Archived artifacts

Immutable patches and commit lists (merge-base three-dot diff):

- [docs/raw/branch-salvage-2026-07/housekeeping-g4-docs-wiki.patch](../raw/branch-salvage-2026-07/housekeeping-g4-docs-wiki.patch)
- [docs/raw/branch-salvage-2026-07/housekeeping-g4-docs-wiki.commits.txt](../raw/branch-salvage-2026-07/housekeeping-g4-docs-wiki.commits.txt)
- [docs/raw/branch-salvage-2026-07/codex-restructure-docs-okf-cmv38j.patch](../raw/branch-salvage-2026-07/codex-restructure-docs-okf-cmv38j.patch)
- [docs/raw/branch-salvage-2026-07/codex-restructure-docs-okf-cmv38j.commits.txt](../raw/branch-salvage-2026-07/codex-restructure-docs-okf-cmv38j.commits.txt)

## Branches retained (code changes)

All other remote branches from the July 2026 audit touch application code, CI, or generated API artifacts. See the backend salvage report for the full UNMERGED inventory.

## Related

- [WIKI_SCHEMA.md](../WIKI_SCHEMA.md) — OKF bundle rules applied by the cmv38j branch
- [log.md](../log.md) — documentation activity log
