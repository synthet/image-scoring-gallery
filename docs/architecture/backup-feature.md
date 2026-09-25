---
type: "Architecture"
title: "Backup feature specification (Gallery)"
description: "Canonical specification for the Backup feature in image-scoring-gallery (Electron main process, DB layer, preload, BackupModal). File references are repo-relative."
resource: "docs/architecture/backup-feature.md"
tags: ["architecture", "gallery-docs"]
timestamp: 2026-08-29T00:00:00Z
---

# Backup feature specification (Gallery)

Canonical specification for the **Backup** feature in **image-scoring-gallery** (Electron main process, DB layer, preload, `BackupModal`). File references are repo-relative.

## Overview

Backup exports high-quality originals from the indexed gallery database to a user-chosen folder (often an external drive). It applies **score filtering**, **stack pre-filter**, **embedding similarity dedup** with **MMR multi-keep** per cluster, optional **cross-day dedup**, and **MMR-aware disk budgeting**. Selection runs **entirely locally in Electron** — it is the single source of truth (the former backend `/api/backup/plan` endpoint was removed to avoid two implementations drifting).

**Default behavior is additive:** existing files on the destination are kept unless **`pruneStaleFiles`** or **`pruneDroppedForSpace`** are explicitly enabled in config.

```mermaid
flowchart LR
  query[query_scored_images]
  dedup[local_dedup_by_day]
  layout[plan_camera_lens_paths]
  space[selectPlanProportional_MMR]
  copy[copy_and_manifest]
  query --> dedup
  dedup --> layout
  layout --> space --> copy
```

---

## Configuration (`config.json` → `backup` section)

| Key | Default | Description |
|-----|---------|-------------|
| `minScore` | `0.5` | Minimum `score_general` (0–1) for candidates |
| `diversityLambda` | `0.7` | MMR balance (1 = score only, 0 = diversity only) |
| `maxPerCluster` | `2` | Max keepers per similarity cluster when disk allows |
| `crossDayDedup` | `false` | Dedup across days within camera+lens+week buckets |
| `pairBatchSize` | `500` | Max IDs per pgvector pair-query batch |
| `pruneStaleFiles` | **`false`** | When true, delete destination files no longer in the current plan (mirror mode) |
| `pruneDroppedForSpace` | **`false`** | When true, delete destination copies dropped for insufficient disk space |
| `reserveFraction` | *(computed)* | **Derived at run time:** `manifestBytes / capacityBytes`. Existing backup size is reserved; only the remainder (capped by free space) is available for new copies. The `backup.reserveFraction` config key is ignored. |
| `includeCurated` | **`true`** | Include curated picks below `minScore`; exempt picks from near-dupe trim |
| `rotateLowScores` | **`false`** | Opt-in: evict lower-scoring residents to admit higher-scoring drops |
| `rotateScoreMargin` | `0.05` | Incoming must beat resident score by this margin to rotate |
| `distributionEnabled` | **`true`** | Master switch for multi-drive fleet distribution; already a no-op unless the destination manifest declares `fleetSize > 1` |

Parsed by [`electron/backupConfig.ts`](../../electron/backupConfig.ts). `maxPerCluster` is scaled down when destination free space is tight (`effectiveMaxPerCluster`).

Use **`minScore: 0.7`** for a curated export; **`0` or `0.5`** for broader archives.

---

## Pipeline (`backup:run` in `electron/ipc/registerBackupHandlers.ts`)

1. Load `manifest.json` (or empty).
2. **Scan destination** and **reconcile** (drop phantoms, adopt orphans as `id: 0`); skip-copy uses disk size match.
3. Query **`getAllScoredImagesForBackup(minScore, { includeCurated })`** — includes `capture_date`, `stack_id`, `is_pick`.
4. Estimate disk pressure (sampled mean source size + present-candidate adjustment) → dynamic similarity threshold + effective `maxPerCluster`.
5. **Selection** — [`deduplicateByDateGroups`](../../electron/backupSelection.ts): stack pre-filter (top `max(2, maxPerCluster)` per real stack; **picks never trimmed**); batched pair queries; BFS clusters; MMR multi-keep with **pick exemption**; optional `applyCrossDayDedup` (ISO week buckets).
6. Batch **`getImageDetailsBatch`** + **`getEmbeddingsBatch`** for layout and space MMR.
7. Plan paths `camera/lens/year/date/basename`; skip unresolved `_unknown_camera` / `_unknown_lens`.
8. **`syncStaleBackupEntries`** — remove manifest rows not in the current plan; **unlink files only when `pruneStaleFiles: true`**. Prebuild entries (`id: 0`) are never unlinked unless the user confirms a mass delete. Then prune empty dirs left by deletes.
9. **`selectPlanProportional`** with `reserveFraction` + `diversityLambda`. Optional **`rotateLowScores`** may evict residents (never `id: 0`) for higher-scoring drops after confirmation gates.
10. Copy files + XMP sidecars; **checkpoint manifest every 250 copies** (+ `finally`); write atomically (temp + `fsync` + `.bak` only on first write of the run).

> **Selection note:** curated picks (`is_pick`) bypass the score floor when `includeCurated` is true and are never dropped by stack/cluster near-dupe selection in favor of a higher-scoring non-pick.

## Stale cleanup and prebuild manifests

| Mode | Manifest rows not in plan | Files on disk |
|------|----------------------------|---------------|
| Default (`pruneStaleFiles: false`) | Removed from manifest | **Kept** |
| Mirror (`pruneStaleFiles: true`) | Removed | Unlinked if in plan exclusion |
| Prebuild (`id: 0`) + mirror, no confirm | Removed | **Kept** (protected) |
| Prebuild + mirror + user confirm | Removed | Unlinked |

[`scripts/prebuild-backup-manifest.mjs`](../../scripts/prebuild-backup-manifest.mjs) creates manifests with `id: 0`. Running a scored backup after prebuild is safe with default config (additive).

Mass delete confirmation is required when **either** stale file deletes **or** space-dropped on-disk deletes exceed **100** files or **10%** of the manifest (`requiresStaleDeleteConfirmation`). The pre-flight (`BackupPreviewInfo`) reports both `wouldDeleteFiles` and `wouldDeleteDroppedForSpace`.

> **Selection note:** images with `stack_id = NULL` are distinct photos the culling phase did not group; the per-date stack pre-filter keeps each as its own singleton and never trims them against one another (only real shared `stack_id` groups are capped, at `max(2, maxPerCluster)`).

Audit tool: [`scripts/audit-backup-manifest-diff.mjs`](../../scripts/audit-backup-manifest-diff.mjs).

---

## Deduplication

### Grouping

**`backupDateKey(img)`** in [`electron/backupSelection.ts`](../../electron/backupSelection.ts): prefer DB **`capture_date`** (`YYYY-MM-DD`); fallback first ISO date in path; else `unknown`.

### Similarity

- Dynamic threshold **0.80–0.99** from disk fill ratio + burst density (`stack_id` ratio).
- **`getSimilarPairsInGroup`** — pgvector cosine pairs; failures surface in **`BackupResult.warnings`**.
- Large date groups: **batched** pair queries + cross-batch merge.
- Per cluster: keep **1–maxPerCluster** images via **MMR** when `maxPerCluster > 1`.

---

## IPC

| Channel | Payload |
|---------|---------|
| `backup:preview` | `targetPath` → `BackupPreviewInfo` (pre-flight counts) |
| `backup:run` | `{ targetPath, confirmMassDelete? }` |
| `backup:progress` | `BackupProgress` |
| `backup:check-target` | manifest summary (incl. declared `driveOrdinal` / `fleetSize`) |
| `backup:set-fleet-identity` | `(targetPath, driveOrdinal, fleetSize)` → `FleetIdentity` |

**`BackupPreviewInfo`:** `minScore`, `candidateCount`, `plannedCount`, `plannedComputed`, `manifestCount`, `wouldDeleteFiles`, `wouldDeleteDroppedForSpace`, `requiresConfirm`, etc. With additive defaults the pre-flight uses a **fast path** (`plannedComputed: false`) that only counts candidates; the exact plan is computed at run time. The full plan is built in preview only when a prune flag is enabled (for accurate delete counts).

**`BackupResult`:** `copied`, `skipped`, `deduplicated`, `errors`, `staleRemoved`, `manifestPruned`, `prebuildProtected`, `droppedForSpace`, optional **`warnings`**, optional **`distribution`** (see [Distributed multi-drive backup](#distributed-multi-drive-backup-fleet)).

---

## Key modules

| File | Role |
|------|------|
| `electron/backupConfig.ts` | Config parsing + confirmation thresholds |
| `electron/backupPipeline.ts` | Shared plan build for preview/run |
| `electron/backupSelection.ts` | Grouping, stack filter, batched dedup, cross-day |
| `electron/backupDiversity.ts` | MMR selection |
| `electron/backupDistribution.ts` | Fleet identity, shard assignment, placement tiers |
| `electron/backupSpace.ts` | Disk budget, stale manifest sync, optional file prune |
| `electron/db.ts` | Queries, embeddings batch |
| `electron/lensFolderName.ts` | Canonical lens folder segment (`…mm`; Nikon quad parsing) |
| `src/components/Backup/BackupModal.tsx` | UI + pre-flight + mass-delete confirm |

---

---

## Distributed multi-drive backup (fleet)

When several drives back up one library and none of them is large enough on its own, running the
same selection on each drive makes all of them converge on the same subset — three 500-image drives
store 500 distinct photos, not 1500. Fleet distribution splits the burst frames between drives while
keeping the important shots everywhere.

### Declaring the fleet

Each drive carries its own position in its `manifest.json` at the destination root:

```json
{ "updatedAt": "…", "driveOrdinal": 2, "fleetSize": 3, "images": [ … ] }
```

The drive is self-describing — plug it into another machine and it still knows it is drive 2 of 3.
Set it from **BackupModal** ("Drive _n_ of _N_" → Save), which calls
**`backup:set-fleet-identity`**; hand-editing is impractical because the manifest is compact
single-line JSON with tens of thousands of rows. `fleetSize: 1` removes both fields and returns the
drive to standalone selection, as does `backup.distributionEnabled: false` in `config.json`.

Anything missing, malformed, or out of range degrades to standalone rather than guessing: a drive
that has not been told its position must keep behaving like a full backup, never silently claim
drive 1's slice.

### Placement tiers

Every planned item gets one tier for *this* drive ([`electron/backupDistribution.ts`](../../electron/backupDistribution.ts)):

| Tier | Contents | Behavior |
|------|----------|----------|
| `mirror` | curated picks + each cluster's rank-0 keeper | copied to **every** drive |
| `shard` | rank ≥ 1 keepers whose shard index is this drive | this drive's exclusive slice |
| `offshard` | rank ≥ 1 keepers owned by another drive | backfill only, if space remains |

Shard assignment:

```
shard(item) = (rankInCluster + fnv1a32(groupKey)) % fleetSize
drive d (1-based) owns items where shard === d - 1
```

- `groupKey` is `cluster:<lowest member id>` — content-derived, so every drive computes the same
  assignment without coordination, and the same drive computes the same one next run. A run-order
  cluster index would shift whenever a cluster appeared or disappeared, forcing a full re-copy.
- The `fnv1a32(groupKey)` stagger rotates the starting drive per cluster. Without it drive 1 would
  own rank 1 of *every* cluster and drive 3 would only see clusters with four or more keepers.
- Cluster ranks come from `DedupResult.clusterRanks`; ties are broken by `id` (`compareForKeep`) so
  ranks — and therefore shards — are stable across runs.

### Budgeting

`selectPlanProportional` runs in two passes: `mirror ∪ shard` competes for the whole budget first,
then leftover space is backfilled from `offshard`, so a larger drive is never left half-empty. On a
standalone drive every item is `shard`, the second pass is empty, and the result is identical to the
previous single-pass behaviour.

Cluster keeper counts are a **fleet** decision, not a per-drive one:
[`electron/backupPipeline.ts`](../../electron/backupPipeline.ts) computes a `fleetFillRatio` against
the *combined* capacity (`usableEstimate × fleetSize`) and feeds
`effectiveMaxPerCluster(maxPerCluster × fleetSize, fleetFillRatio)`. Sizing against one small drive
would collapse every cluster to a single keeper (`effectiveMaxPerCluster` returns 1 below a 0.5 fill
ratio), leaving nothing for the other drives to take. The same ratio raises the per-stack pre-filter
cap above its historic floor of 2.

`roughFillRatio` is unchanged and still reflects this one drive.

### Reporting

`BackupPreviewInfo` gains `driveOrdinal`, `fleetSize`, `mirrorCount`, `shardCount`, `offshardCount`;
`BackupResult` gains `distribution: { ordinal, size, mirrored, sharded, offshardBackfilled }`.

Fleet membership does **not** disable the additive preview fast path. Building a real plan just to
show a tier split costs a destination scan plus pgvector dedup over every date group, and
`BackupModal` disables **Start Backup** (`cursor: wait`) for the whole preview. The fleet position
comes straight from the manifest and is always reported; the tier counts arrive with `BackupResult`
after the run, exactly as `plannedCount` already does.

### Worked example

1000 candidates in 250 clusters of 4, each drive holding 500:

| | distinct photos across 3 drives |
|---|---|
| before | 500 (all three drives identical) |
| after | 1000 (250 mirrored leaders + 750 sharded frames) |

Every cluster leader and every curated pick still survives the loss of any single drive.

---

## Lens folder naming

Backup and Sync layout uses **`camera / lens / year / date / filename`**. The **lens** segment is a short focal-length token:

| EXIF `lens_model` example | Folder segment |
|---------------------------|----------------|
| `NIKKOR 35mm f/1.8` | `35mm` |
| `28-105mm f/3.5-4.5` | `28-105mm` |
| `35 35 1.8 1.8` (Nikon D-era numeric quad) | `35mm` |
| `28 105 3.5 4.5` | `28-105mm` |

Parsed by [`electron/lensFolderName.ts`](../../electron/lensFolderName.ts) (`normalizeLensFolderName`). Python parity: [`modules/lens_folder_name.py`](https://github.com/synthet/image-scoring-backend/blob/main/modules/lens_folder_name.py).

Aperture is **not** part of the folder name — two 50mm primes (`f/1.4` and `f/1.8`) both use `50mm`.

**Legacy trees** with duplicate numeric folders (e.g. `D90/35 35 1.8 1.8/` alongside `D90/35mm/`): merge with sibling backend script (dry-run first):

```bash
python scripts/maintenance/merge_numeric_lens_folders.py --root "H:/Photos" --dry-run
```

Rewrites `manifest.json` `relPath` prefixes when a manifest is present at the backup root.

---

## Tests

- `electron/backupConfig.test.ts`
- `electron/backupSelection.test.ts`
- `electron/backupDiversity.test.ts`
- `electron/backupSpace.test.ts` (includes prune safety regression tests)
