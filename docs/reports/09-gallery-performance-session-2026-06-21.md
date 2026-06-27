---
type: Research Report
title: Gallery performance and loading session summary (2026-06-21)
description: Session summary — spinner/stacks fixes, hook-order crash, DB regression findings, and recommended next steps.
resource: 09-gallery-performance-session-2026-06-21.md
tags: [reports, gallery, performance, stacks, indexing, postgres]
timestamp: 2026-06-21T21:15:00Z
okf_version: 0.1
---

# Gallery performance and loading session summary (2026-06-21)

Point-in-time summary of work from the Cursor session (including prior context from exported transcripts and the pretzel plan). **Repo:** `image-scoring-gallery` v7.21.1 — changes are **local / uncommitted** unless noted.

---

## Problems reported

| Symptom | Scope |
|---------|--------|
| Perpetual **"Loading…"** spinner on root gallery (Stacks OFF) | UI / hooks |
| Newest visible image stuck at **#177084 (2026-05-24)** | Data + UI |
| Subfolders under `180-600mm/2026` stop at **2026-05-24** while disk has dates through **2026-06-14** | Data |
| **Stacks** view stuck on "Loading stacks…" with count shown but no grid | Stacks SQL + cache rebuild |
| App crash: **`ReferenceError: Cannot access 'stacksMode' before initialization`** | Hook order bug |

---

## Root causes identified

### UI / loading (fixed in code)

1. **`useStacks()` ran on mount even when Stacks was OFF** → `stacksLoading` kept the shared spinner active.
2. **Corner spinner was not scoped** to the active view (images vs stacks vs stack drill-down).
3. **`loadMore` on error** left `hasMore=true` and retried the same offset → infinite spinner loop.
4. **`getStacks` with `capture_date` sort** ordered by EXIF `COALESCE(...)` on the full library UNION → very slow at root.
5. **Stack cache rebuild on every Stacks enable** blocked first paint (`DELETE` + full repopulate before `refreshStacks`).
6. **`useStacks(..., stacksMode)` before `useStacksMode()`** → temporal dead zone crash on startup.

### Data (not fixed by gallery UI alone)

Live DB (`127.0.0.1:5432/image_scoring`, same config as gallery and backend):

| Metric | Value |
|--------|--------|
| `images` count | ~61,597 |
| `MAX(images.id)` | **177084** |
| `images_id_seq.last_value` | **190180** (IDs up to ~190k were once allocated) |
| Rows with `id` 177085–190180 | **0** (~13k rows missing) |
| Images with `2026-06` in path | **0** |
| Files on disk in `2026-06-14` folder | **540** (unindexed in DB now) |

**Conclusion:** The library **was** indexed beyond 5/24 recently (forensics JSON from today references **#195193**; pretzel plan cited **#195280** / max **195968**). Something **removed or rolled back** the tail of the `images` table — not a gallery display-only bug. Re-indexing or backup restore is required to get June content back.

Earlier performance work (v7.21.0, from exported transcript):

- `imsOverlayJoin` → per-row **LATERAL** (avoids full-table `image_model_scores` aggregation).
- `getFolders()` → single grouped count subquery.
- Removed **Min CLIP Quality** sidebar filter; `folder_id` on list queries + **Open Folder** fallback.
- `sub_stack_id` missing-column fallback + cached probe after first `42703`.

---

## Code changes (gallery, uncommitted)

### `src/hooks/useDatabase.ts`

- `enabled` flag on `usePaginatedData`; `useStacks(..., enabled)`.
- On `loadMore` error: `hasMore=false`, expose `loadError`.
- `preserveItems` refresh path for trimmed grids.

### `src/AppContent.tsx`

- Scoped corner spinner to active view.
- **Refresh** button + window focus poll when `getImageCount` increases.
- Stacks loading copy: "Building stack cache…" / "Loading stacks…".
- **Hook order fix:** `useStacksMode` before `useStacks`; `refreshStacks` via ref.

### `src/hooks/useStacksMode.ts`

- Load stacks immediately on enable; rebuild cache **only if empty** (`getStackCacheCount`).
- `cacheRebuilding` state for overlay messaging.

### `electron/db.ts` + `electron/sortSql.ts`

- `capture_date` list sort: `ORDER BY i.created_at` (display still uses EXIF).
- `capture_date` stack sort: `i.created_at` for sort_value.
- Cached `subStackColumnAvailable` after first `42703`.
- `getStackCacheCount()`; trim `getImageDetails` (no `fs.existsSync` / JSON round-trip per prior session).
- Progressive viewer path in `useImageOpener.ts` / `ImageViewer.tsx`.

### IPC / server / bridge

- `getStackCacheCount` wired: `electron/main.ts`, `preload.ts`, `bridge.ts`, `server/index.ts`, `electron.d.ts`.

### Tests added/updated (passing in session)

- `electron/db.getFolders.test.ts`, `db.getImageDetails.test.ts`, `db.getImages.test.ts`, `db.getStacks.test.ts`
- `src/hooks/useImages.race.test.tsx`, `useStacksMode.test.tsx`, `useImageOpener.test.tsx`
- `src/components/Viewer/ImageViewer.test.tsx`, `src/utils/keywordFilters.test.ts`

**Verify command:**

```bash
cd d:\Projects\image-scoring-gallery
npm run test:run -- electron/db.getImageDetails.test.ts electron/db.getImages.test.ts electron/db.getStacks.test.ts src/hooks/useStacksMode.test.tsx src/hooks/useImages.race.test.tsx src/components/Viewer/ImageViewer.test.tsx
npx tsc --noEmit
```

---

## Related plans / transcripts

| Artifact | Role |
|----------|------|
| `C:\Users\dmnsy\.cursor\plans\gallery_grid_spinner_fix_41f60dc0.plan.md` | Original Cursor plan |
| `C:\Users\dmnsy\.claude\plans\loading-is-spinning-last-eventual-pretzel.md` | Refined plan with live DB timings |
| `C:\Users\dmnsy\Downloads\cursor_gallery_app_performance_and_filt.md` | Exported session (perf + CLIP filter + Open Folder) |

---

## Next steps (recommended order)

### 1. Verify gallery locally

```bash
cd d:\Projects\image-scoring-gallery
npm run dev
```

- App loads **without** error boundary (`stacksMode` fix).
- Root grid: corner spinner **clears** after first page (Stacks OFF).
- Toggle **Stacks**: grid or "Building stack cache…" then stacks appear.
- Open a NEF: scores visible quickly; **Open Folder** present.

### 2. Commit gallery fixes

Single PR on `image-scoring-gallery` with conventional message, e.g.  
`fix(gallery): scope loading state, stacks cache gate, and hook order`

Include test files and bump note in `CHANGELOG.md` if you ship releases from this repo.

### 3. Recover missing June (and post–5/24) data — choose one

**Option A — Backup restore (preferred if dump exists)**

- Search `backups/postgres`, Dropbox mirror (`D:\Dropbox\Photos\Scoring`), or any `pg_dump` from when `#195280` / `#195193` still existed.
- Restore into `image_scoring` (stop WebUI/gallery first; follow `Backup-Postgres.ps1` / restore runbook).

**Option B — Re-index from disk**

- Vexlum **Runs** → Discovery/indexing on `D:\Photos\Z8\180-600mm\2026` (or full `Z8` tree).
- Re-run scoring/culling as needed for new rows.

**Option C — Forensics (prevent repeat)**

- Inspect `jobs`, `deleted_images` (~936 rows), `webui.log` / `debug.log` for `prune_missing_files`, restore, or maintenance around **2026-06-21** (Postgres container restarted ~16:59 UTC).
- Correlate with any manual DB or Docker volume operations.

### 4. Optional live verification (CDP)

With `npm run dev` and Electron CDP on **9222**:

- `is-ui-mcp`: `live.cdp_console_logs` — no repeating `Failed to load data`.
- Confirm first grid card ids match DB order for current sort.

### 5. Backend / cross-repo

- No backend code changes required for the gallery UI fixes.
- If re-indexing: monitor pipeline via backend Runs UI or `is-be-mcp` in Cursor.
- Sub-stack migration: when backend adds `images.sub_stack_id`, gallery fallback warning can stop.

---

## Open questions

1. **What deleted image rows 177085+?** Sequence at 190180 proves they existed; no rows in `deleted_images` for those ids found in quick queries.
2. **Forensics #195193 vs live stack #29157** — same stack id, member ids now 51352–51440; suggests re-cluster and/or bulk delete of high-id members.
3. **Pretzel plan DB snapshot (64k / 195968)** vs current (61.6k / 177084) — same host Postgres; state changed during the day.

---

## Status checklist

| Item | Status |
|------|--------|
| Spinner / pagination / refresh hooks | Done (uncommitted) |
| Stacks cache gate + fast sort | Done (uncommitted) |
| `stacksMode` crash fix | Done (uncommitted) |
| June folders/images in DB | **Not done** — needs restore or re-index |
| Gallery commit / PR | **Pending** |
| Root-cause of image row loss | **Pending** investigation |
