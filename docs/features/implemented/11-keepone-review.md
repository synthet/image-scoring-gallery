---
type: "Implemented Feature"
title: "Keep-one review (read-only, library-wide)"
description: "Read-only tool view that loads a keep-one study export and shows, across shoots, each same-moment cluster's keeper next to the frames proposed for soft-cull, with frozen scores and live catalog state."
resource: "docs/features/implemented/11-keepone-review.md"
tags: ["features", "gallery-docs", "implemented", "dedupe", "culling"]
timestamp: 2026-11-01T00:00:00Z
okf_version: 0.1
---

# Keep-one review (read-only, library-wide)

**Purpose:** review keep-one proposals across many shoots in the gallery, using its own thumbnails and viewer, instead of a per-shoot HTML report.

**Primary code:**
- [`electron/keepOneReview.ts`](../../../electron/keepOneReview.ts): export validation and the view model (pure).
- [`electron/ipc/registerStudyHandlers.ts`](../../../electron/ipc/registerStudyHandlers.ts): the file picker and the read-only loader, `study:load-keepone-review`.
- [`electron/db.ts`](../../../electron/db.ts) `getImagesForKeepOneReview`: live flags and media paths by image id, queried in chunks of 1,000.
- [`src/components/KeepOne/KeepOneReviewPage.tsx`](../../../src/components/KeepOne/KeepOneReviewPage.tsx): summary, filters and cluster cards.

## Where the export comes from

The export uses schema `driftara-keepone-review/1`. It is written by `keepone_export` in **image-scoring-skills** (`scripts/neardupe_study/experiments/keepone_export.py`) from finished keep-one runs. See that repo's `docs/keep-one.md`. It embeds no images.

This is a study artifact, not a backend contract. If the view becomes a service, its read model belongs in the backend's canonical contract.

## Behaviour

| Step | What happens |
|---|---|
| **Tools › Keep-one Review** | Opens the tool view. It is disabled in folder (filesystem) mode, because frames resolve from the catalog. |
| **Open keep-one export…** | Main process opens a JSON file picker, reads the file (64 MB cap), hashes it and validates the schema. It then looks up only the image ids the export references. |
| Summary | Shoots, frames, clusters with removals, proposed soft-culls, their size, and how many frames are no longer in the catalog. |
| Filters | Shoot, removal basis (head sharpness, focus score, tie), and **Changed since run**. |
| Cluster card | The keeper first, then each proposed soft-cull, with focus/eye/noise/exposure bars, the removal basis and any Jev tie confidence. |
| Click a frame | Opens the normal viewer. Frames no longer in the catalog cannot be opened. |

**Changed since run** compares live rating, label and stored pick status with the values frozen in the export. Pick status counts only when both sides report it, because older catalogs lack the column.

## Read-only

The view never writes ratings, labels, flags or files. A cancelled pick does nothing. A wrong schema, malformed clusters or an unreadable file show a message and keep the previous view.

**Applied runs:** once proposals have been applied and their frames deleted, those frames show as **Not in catalog**. Their frozen data is still shown, but there is no thumbnail. This is the case for the 2026-11-01 substack runs: all 48 removals were applied, and the 46 keepers still resolve.

## Tests

- `electron/keepOneReview.test.ts`: validation, the live join, missing frames and the older-catalog pick status.
- `electron/ipc/registerStudyHandlers.test.ts`: loader, size cap and IPC cancel.
- `electron/db.localPorts.test.ts`: chunked query and the missing-column fallback.
- `src/components/KeepOne/KeepOneReviewPage.test.tsx`: rendering, opening frames, filters and failure messages.
