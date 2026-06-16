---
type: "Implemented Feature"
title: "Sync from device (Electron workflow)"
description: "End-to-end behavior of File → Sync in Driftara Gallery: filesystem scan, optional copy into the configured photo tree, direct PostgreSQL registration, and backend pipeline submissi"
resource: "docs/features/implemented/06-sync-from-device-workflow.md"
tags: ["features", "gallery-docs", "implemented"]
timestamp: 2026-06-16T00:00:00Z
---

# Sync from device (Electron workflow)

End-to-end behavior of **File → Sync** in Driftara Gallery: filesystem scan, optional copy into the configured photo tree, direct PostgreSQL registration, and backend pipeline submission. Use this page when debugging progress UI, IPC, or “why counts don’t match.”

**Backend vocabulary and DB truth for pipeline phases:** [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md) and [ELECTRON_SYNC_IMPORT_AND_PHASES.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/ELECTRON_SYNC_IMPORT_AND_PHASES.md) (sibling repo).

## Entry and guards

- **Menu:** `electron/main.ts` — **Sync** opens a directory dialog; on success the main process sends `sync:source-selected` with the chosen path.
- **Renderer:** `useElectronListeners.ts` stores the path and opens `SyncModal`.
- **Guards:** Sync is disabled while a backup run is active, while a sync **run** is in progress, or while a sync **preview** IPC is active (`syncGuards` in `electron/main.handlers.ts`).

## Configuration

- **Destination root:** `config.json` → `sync.destinationRoot` (Windows path). If unset, the implementation falls back to `D:\Photos` in code — confirm your effective value in Settings / `config.json`.
- **Source:** Any folder or drive root (e.g. `E:\`); only specific file extensions are considered (see below).

## Phases (UI labels vs `sync:progress`)

| UI label (`SyncModal.tsx`) | `progress.phase` | What happens |
|----------------------------|------------------|--------------|
| Detecting last sync | `detecting` | Compute watermark date under destination; **DB reads** for max capture/import dates under destination; **disk reads** for existing `YYYY-MM-DD` leaf folders. |
| Scanning source | `scanning` | Recursive listing of source files matching extensions. **No DB writes.** |
| Preview (analyzing files) | `preview` | **Preview only (`dryRun`).** Per file: EXIF via exiftool, skip rules, duplicate checks. **DB reads** (`findImageByUuid`, `findImageByFilePath`). **No inserts.** |
| Copying new files | `copying` | **Full sync only.** `mkdir` + `copyFile` into `destinationRoot/camera/lens/year/YYYY-MM-DD/`. |
| Importing into database | `importing` | **Full sync only.** `insertImage`, `markImageIndexingPhaseDone`, then per-folder `scheduleProcessingForImages`. |
| Complete | `done` | Modal summary or end of preview. |

Primary implementation: `runSyncFromSource` in `electron/main.ts`.

## File selection and layout

- **Extensions:** Only **`.nef`** files are collected from the source tree (`SYNC_EXTENSIONS`). Other RAW types are ignored unless the code is extended.
- **Destination relative path:** `camera / lens / year / shoot-date / filename`, with camera and lens derived from EXIF (see `normalizeCameraModel`, `normalizeLensFolderName`). Lens folders use short `…mm` tokens; Nikon numeric quads (`35 35 1.8 1.8`) normalize to `35mm`. See [backup-feature.md](../../architecture/backup-feature.md) § Lens folder naming.

## Preview vs full sync

- **Preview** (`ipcMain.handle('sync:preview')`) runs `runSyncFromSource(..., dryRun: true)` and returns counts and paths **but does not return `candidates`** to the renderer in the current IPC response shape.
- **Start sync** (`ipcMain.handle('sync:run')`) calls `runSyncFromSource(..., dryRun: false)`. Because **candidates are not passed back from preview**, the full run performs **`collectImageFiles(sourcePath)` again** — the same total file count as preview, not only the “would copy” subset.

So the **copying** step’s progress denominator is typically **all matching source files** (e.g. 13 970), while **importing** uses **pending destination paths** (e.g. 733). Early **percentage** on the copy phase can stay at **0%** for many files because `round(current/total*100)` may be zero until `current` is large enough.

## Database touchpoints (gallery process)

| Stage | Writes |
|-------|--------|
| Preview | None (reads only for threshold and dedupe). |
| Copy | Files on disk under `destinationRoot`. |
| Import | `folders` (via `getOrCreateFolder`), `images` (`insertImage`), `image_phase_status` for **indexing** = **done** (`markImageIndexingPhaseDone`), folder aggregate flags. |
| After import | **`scheduleProcessingForImages`** in `electron/scheduleProcessing.ts`: on success, **`POST /api/pipeline/submit`** with `metadata`, `score`, `tag`, `cluster` and the new `image_ids`; on API failure, **`markImagePhasesPending`** for those ids. |

Indexing in the **submit** call is intentionally **not** re-requested; Electron has already marked the **indexing** (`Discovery`) phase complete for those rows.

## Logs

- **Renderer:** `Logger` (`src/services/Logger.ts`) → IPC `debug:log` → append JSON lines under Electron **userData** via `SessionLogManager` (see `electron/main.ts`). Look for `[SyncModal]` prefixes.
- **Main process:** `console` lines such as `[Main] Sync preview`, `[Sync] Watermark`, `[Main] Sync schedule`.
- **Python WebUI:** After a successful pipeline submit, job/run activity appears in **`webui.log`** / **`debug.log`** on the backend; **`jobs.id`** matches the “Submitted to backend (job …)” line in the sync summary when scheduling uses the API path.

## “Phases” sidebar in `ImageViewer` (not `image_phase_status`)

The gallery’s right-hand **Phases** block does **not** read PostgreSQL `image_phase_status` for all rows. It uses **heuristics** (e.g. **Inspection** = whether `exifData` loaded in the viewer; **Quality Analysis** = `score_general` present; **Tagging** = `keywords` present; **Similarity Clustering** ≈ rating/label). For authoritative per-phase status, use the **Vite** image inspector (`/ui/images/:id`) or SQL — see the backend doc above.

**Code:** `src/components/Viewer/ImageViewer.tsx` (Phases section).

## Related code

| Area | Path |
|------|------|
| Modal UI | `src/components/Sync/SyncModal.tsx` |
| IPC bridge | `electron/preload.ts` (`sync:preview`, `sync:run`, `sync:progress`) |
| Core sync | `electron/main.ts` (`runSyncFromSource`, `detectSyncThresholdDate`, `collectImageFiles`) |
| Post-import schedule | `electron/scheduleProcessing.ts` |
| DB helpers | `electron/db.ts` (`insertImage`, `markImageIndexingPhaseDone`, `markImagePhasesPending`, destination threshold queries) |
