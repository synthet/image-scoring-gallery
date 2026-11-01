---
type: "Technical Reference"
title: "Backend independence: what the gallery needs the backend for"
description: "Inventory of every gallery feature that calls the Python backend, which ones can run locally in Electron, and the connection flag that gates the rest."
resource: "docs/technical/BACKEND_INDEPENDENCE.md"
tags: ["gallery-docs", "technical", "backend", "api"]
timestamp: 2026-10-31T00:00:00Z
okf_version: 0.1
---

# Backend independence

Driftara Gallery browses and edits the library straight from PostgreSQL (`database.engine: postgres`). It calls the Python backend (**image-scoring-pipeline** FastAPI, default `http://localhost:7860`) for 42 live REST paths. This page records:

- which of those paths can run in the Electron main process;
- which already do;
- which stay on the backend;
- how the app behaves when the backend is down.

Endpoint shapes are owned by the backend. See the [API contract](https://github.com/synthet/image-scoring-pipeline/blob/main/docs/technical/API_CONTRACT.md) and [OPENAPI_CONTRACT.md](OPENAPI_CONTRACT.md).

> **Engine caveat.** With `database.engine: api`, every gallery SQL query goes through the backend's `/api/db/query`. In that mode nothing can run without the backend, so the local ports below only apply to the direct `postgres` engine.

## Connection flag

- **Main process monitor.** `electron/backendConnection.ts` does the following:
  - Runs `/api/health` once the window finishes loading, then every 60 s while connected and every 30 s while disconnected.
  - Re-resolves the base URL from `webui.lock` and `config.api` before every check, so a backend restarted on a new port is picked up.
  - Treats any backend request that gets no answer at all (connection refused or reset) as disconnected right away. Timeouts and HTTP errors do not count.
  - Broadcasts the result as `backend-status-changed`.
- **Renderer.**
  - `src/store/useBackendStatusStore.ts` holds the state. `useBackendUnavailable()` is true only after a check has failed; `unknown` and `checking` are not treated as down.
  - `reconnectCount` increases on every reconnect. The WebSocket, scoring sort options, stack analytics, agent cull review and diagnostics hooks re-fetch when it changes.
  - The header chip (`BackendStatusChip`) shows the status and reconnects when clicked.
- **Menu.** *Tools* shows `Backend: …` and **Connect / Reconnect to Backend** (`Ctrl+Shift+B`). *Scoring…* is disabled while disconnected. *Image › Find Similar Images* stays enabled when similarity can run locally.
- **Gated controls.** While the backend is down these are disabled and their tooltip says the backend is not connected:
  - text search submit;
  - agent cull review actions;
  - diagnostics refresh and evidence export;
  - AI keyword suggestions and tag propagation;
  - the "open in backend" image-ID link.

  The stack analytics banner is hidden.

## Feature inventory

Category: **A** SQL, **B** files, EXIF or image processing, **C** ML models, **D** job control or in-memory backend state. Status: **local** runs in the gallery; **fallback** tries one side and then the other; **backend** needs the backend.

| Gallery feature | Backend path | Cat | Port effort | Status |
|---|---|---|---|---|
| Find similar images | `GET /api/similarity/search` | A (C only to compute a missing embedding) | S | **local** on `postgres`: pgvector over stored MobileNet embeddings (`db.searchSimilarByStoredEmbedding`). Uses the backend only when the query image has no embedding |
| Search example chips | `GET /api/similarity/example-queries` | A | S | **local** on `postgres` (`db.getSearchExampleQueries`) |
| Keep neutral / pick status | `PATCH /api/images/{id}` (`pick_status`) | A | S | **fallback**: backend first, because it writes the audit row; local `db.updateImagePickStatus` while disconnected |
| Import | `POST /api/import/register` | A + B | — | **fallback** (existing): direct DB insert with local exiftool |
| Auto-schedule after import/sync | `POST /api/pipeline/submit` | D | — | **fallback** (existing): marks phases pending in the DB |
| Scoring sort options | `GET /api/models` | other | — | **fallback** (existing): backend `config.json` and defaults; only `load_status` needs the backend |
| Eye keypoints | — | A | — | **local** (existing, `db.getEyeKeypointsBatch`) |
| Autofocus point | — | B | — | **local**: `image_exif.af_metadata`, falling back to the file's Nikon MakerNotes through exiftool |
| Near duplicates | `POST /api/similarity/duplicates` | A | S | backend; port planned |
| Outliers | `GET /api/similarity/outliers` | A + math | M | backend; port planned (O(n²) cosine per folder) |
| Stats | `GET /api/stats` | A | S–M | backend (no renderer caller today) |
| Scope tree | `GET /api/scope/tree` | A | S | backend (no renderer caller); local `db.getFolders` covers it |
| Job history | `GET /api/jobs/recent`, `/api/jobs/{id}` | A | S | backend (no renderer caller) |
| Stack analytics banner | `GET /api/analytics/stacks/{id}` | A | M–L | backend: about 2,000 lines of SQL and aggregation in `culling_analytics/` |
| Agent cull review: list and detail | `GET /api/culling/agent-review/groups[/{id}]` | A | S–M | backend; port planned |
| Agent cull review: approve, reject, apply, rollback | `POST …/approve`, `/reject`, `/apply-candidates`, `/recommendations/{id}/rollback` | A | M | backend: state machine with audit rows; parity required |
| Agent cull review: delete approved | `POST …/delete-approved` | A + B | M | backend: irreversible file and DB delete; parity required |
| Agent cull review: run | `POST /api/culling/agent-review/run` | C | infeasible | backend: external LLM CLI and about 4,000 lines of orchestration |
| Fix image metadata | `POST /api/scoring/fix-image` | A | M | backend (no renderer caller) |
| Evidence v1 grids | `GET /api/images/{id}/evidence` | A + B | M | backend: Laplacian and noise grids over the thumbnail |
| Diagnostic layers: sharpness, peaking, noise, head | `…/evidence?schema_version=2`, `/requests`, `/artifacts` | B + D | L | backend (cv2 job manager and cache) |
| Diagnostic layer: subject mask | same | C | infeasible | backend: SAM2 on GPU |
| Semantic text search | `GET /api/similarity/text-search` | C | infeasible | backend: CLIP ViT-B/32 text encoder |
| AI keyword suggestions, tag propagation | `POST /api/tagging/propagate` | A/C (not verified) | — | backend |
| Scoring, tagging, clustering, pipeline control, job queue | `/api/scoring/*`, `/api/tagging/*`, `/api/clustering/*`, `/api/pipeline/*`, `/api/jobs/queue`, `/cancel` | C + D | infeasible | backend (PyTorch/TF models, dispatcher) |
| Live updates | WebSocket `/ws/updates` | D | — | backend; reconnects with a fresh retry budget after a backend reconnect |
| Scoring window | `/ui/runs` (proxied) | D | — | backend |

**Totals.**

| Group | Paths |
|---|---|
| Portable to Node (A, or B with S–M effort) | 17 |
| Already local or with a fallback | 6 |
| Backend-only (ML models or job control) | 21 |

**Unused wrappers.** These `apiService` wrappers have no renderer or IPC caller, and many already have local `db.ts` equivalents. They are listed here, not removed:

- `getSchema`, `fixScoringDb`, `getImages`, `getImageById`, `getFolders`, `rebuildFolders`, `getStacks`, `getStackImages`, `getCullingAnalytics`, `getPhaseDecision`, `getRawPreview`, `getSourceImage`
- the IPC-only `api:scoring-*`, `api:tagging-start|stop|status|single`, `api:clustering-*`, `api:pipeline-*` and `api:jobs-*` channels

## Autofocus point: why it can be empty

1. **Viewer reticle is off.** View › Focus Point is now saved in `view-prefs.json` (userData) and starts **on**. Bounding Box and Eyes start off.
2. **Older rows have no `af_metadata`.** The `image_exif.af_metadata` column was added by backend migration 0044 (2026-10-24) without a backfill. Older rows stay NULL until the backend metadata stage runs again.
   - The viewer falls back to reading the file's MakerNotes.
   - A race used to drop that read when DB details arrived first. It is now fixed: one cached read per file.
   - The grid has no file fallback; it draws only from the database. On 2026-10-31 just 366 of 80,809 rows had AF data.
   - **Backfill:** backend `scripts/maintenance/backfill_exif_af.py` ([#726](https://github.com/synthet/image-scoring-pipeline/issues/726)). It re-reads files (never writes them) for rows with NULL `af_metadata`. By default it covers `NIKON Z%` models. It pages by `images.id`; resume with `--after-id`. It needs ExifTool 13.x.
     - In Git Bash, prefix with `MSYS_NO_PATHCONV=1`, or `--path-like "%/…"` is rewritten into a Windows path.
     - Throughput is about 0.55 s per image with one ExifTool process.
     - Pilot: Z8/2026-10-24 went from 0 to 568 of 568.
3. **The camera did not record AF coordinates.** This happens with `AFCoordinatesAvailable = 0` (for example Z8 Auto-area), DSLR viewfinder phase-detect, exports with MakerNotes stripped, or ExifTool older than 13.x for Z8 AFInfo2 `0400`. The gallery parser now applies the backend's `AFCoordinatesAvailable` guard. The sidebar shows "No AF point data" for Nikon images without coordinates.
4. **The AF area is tiny in the grid.** A 152 px Z8 area on an 8256 px sensor is about 5 px on a thumbnail. The grid's compact reticle is now placed at the AF center and drawn at least 12 px wide. The viewer still draws the real size.
5. **Portrait images.** The AF box is in the sensor's frame, with no EXIF orientation applied, so it is misplaced on portrait shots. This is a known gap.
