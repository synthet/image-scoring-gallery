# Changelog

All notable changes to this project will be documented in this file.

## [7.2.0] - 2026-04-25

### Added

- **Find similar images**: Right-click a grid or stack card to open **Find Similar Images** (`SimilarSearchDrawer`); jump to a result or its folder from the drawer.
- **Export bake tests**: Coverage for **`getJpegOrientation`**, **`applyOrientationTransform`**, and JPEG fixtures under **`src/utils/fixtures/`**.
- **`npm run doctor`**: Local diagnostics entry point (`scripts/doctor.mjs`).

### Changed

- **`test:db` script**: `../image-scoring` → **`../image-scoring-backend`** for the shared test DB helper path.

### Fixed

- **JPEG export orientation**: Renderer bake uses storage-order pixels (`createImageBitmap` + manual EXIF transform) with safer fallbacks so previews are not double-rotated. **Main process** runs a dedicated **ExifTool** pass to set **Orientation = 1** (`useMWG: false`, numeric tags) right after writing the file so apps like **Windows Photos** do not apply the old preview tag on top of baked pixels.

## [7.1.0] - 2026-04-24

### Added

- **Backend detail deep-link**: Image viewer action now opens the Python backend’s image details page (`/ui/images/<id>`), using a new `openExternalUrl()` bridge function (IPC when running in Electron; `window.open` fallback in browser mode).

### Changed

- **Menu**: Disabled **Duplicates** and **Embeddings** entries (temporarily) to avoid presenting non-functional routes.
- **Export raster bake**: `bakeExifOrientationToBlob()` now relies on Chromium’s default EXIF auto-orientation during `<img>` decode, then writes an upright raster with Orientation set to 1.

### Fixed

- **Scoring UI window reuse**: Opening backend URLs now reuses an existing scoring/webui shell window when available, instead of always spawning a new one.

## [7.0.2] - 2026-04-15

### Changed

- **Connection store**: renamed `isBackendEnabled` → `isWebSocketEnabled` across store, hooks, and components for clarity — the toggle only controls WebSocket real-time updates, not the full backend connection.
- **Diagnostics modal**: toggle label updated to "Real-time Updates" with WebSocket-specific description.
- **Bridge**: removed dead `isBackendEnabled` guard from folder-stub logic; removed unused `useConnectionStore` import.

### Fixed

- **Gallery sort**: added `i.id DESC` as tiebreaker in `getImages` query to guarantee stable pagination order when primary sort values are identical.
- **ImageViewer navigation**: use a ref to track current image ID, preventing unnecessary `setImage` / `setDetailsLoaded` calls when `allImages` reference changes without the target ID changing.

## [7.0.1] - 2026-04-13

### Changed

- **PostgreSQL provider** (`electron/db/provider.ts`): startup log for pool config; validate `pg.Pool`; **`pool.on('error')`** for idle client failures; **`checkConnection`** throws a detailed message (user, host, port, database) instead of returning false; stricter **`PgPoolLike`** typing.
- **`useDatabase`**: relies on **`checkDbConnection()`** throwing from the main process; connection timeout hint points at PostgreSQL **127.0.0.1:5432** instead of Firebird.

### Fixed

- **`ImageViewer`**: loading state shows a spinner; **null** or failed **`getImageDetails`** surfaces a short error line instead of staying ambiguously empty.

### Docs

- **`docs/README`** and **planned embeddings** README: navigation and cross-links updated.
- **Wiki tooling**: Cursor/Claude slash commands (`wiki-ingest`, `wiki-lint`, `wiki-query`), **`docs-wiki`** skill, **`documentation.mdc`** rule, and **`docs/log.md`** (aligned with backend wiki conventions).

## [7.0.0] - 2026-04-13

### Added

- **Backend connection preference** (`src/store/useConnectionStore.ts`): persisted toggle (localStorage) to disable Python API/WebSocket activity; **Diagnostics** modal switch with "manually disabled" status; **`useGalleryWebSocket`** skips connecting when off; **bridge** uses folder-mode stubs when the backend is disabled.

### Changed

- **Export — raster bake** (`src/utils/exportImageBake.ts`): **`getJpegOrientation`** plus canvas transforms for all eight EXIF orientation values; **`bakeExifOrientationToBlob`** returns **`BakeResult`** (`blob`, **`sourceOrientation`**, **`didNormalize`**, dimensions).
- **Export — filename**: suggested JPEG export name uses **`${baseName}.jpg`** after bake.
- **`electron/types.ts` / `src/electron.d.ts`**: typed **`ExportImageContext`** for **`setCurrentExportImageContext`**.

### Fixed

- **Export metadata** (`electron/main.ts`): writes **Orientation** **`1`** after renderer bake; strips orientation-related tags that would conflict with upright pixels; diagnostic log includes preview vs raw orientation and normalization flag.

### Removed

- **Breaking — Export IPC**: **`exifOrientationBaked`** on **`ExportImageContext`** / **`setCurrentExportImageContext`** replaced by **`pixelNormalizationApplied`** and optional **`previewOrientation`**.

## [6.0.0] - 2026-04-12

### Added

- **Backup space planner** (`electron/backupSpace.ts`): volume free space via `statfs`, stale manifest cleanup, proportional per-date-folder selection, and XMP sidecar sizing; **`BackupResult`** adds **`staleRemoved`** and **`droppedForSpace`**.
- **Camera folder names** (`electron/cameraFolderName.ts`): parity with **`image-scoring-backend`** `camera_folder_name.py` for backup/sync path segments.
- **Windows / WSL path repair** (`electron/pathWinWsl.ts`): normalizes `/mnt/<drive>/...` and hybrid `X:/mnt/...` shapes for Node **`fs`** on Windows.
- **`prebuild-backup-manifest`** npm script (`scripts/prebuild-backup-manifest.mjs`).
- **Tests**: unit coverage for **`backupSpace`**, **`cameraFolderName`**, and **`pathWinWsl`**.

### Changed

- **Intelligent Backup**: score selection and dedupe thresholds are computed in the main process from available space (see **`backupSpace.ts`**) instead of passing **`minScore`** / **`similarityThreshold`** from the UI; **`BackupModal`** invokes backup with the destination path only.
- **`getAllScoredImagesForBackup`**: drops the **`minScore`** parameter and selects rows with **`score_general > 0`**; finer filtering happens in the planner.
- **Docs** (`docs/architecture/backup-feature.md`): camera normalization references **`cameraFolderName.ts`** and the Python twin module.

### Removed

- **Breaking — IPC**: **`electron.backupRun`** is **`(targetPath: string)`** only; **`minScore`** and **`similarityThreshold`** arguments were removed from preload and typings.
- **Breaking — Config typing**: structured **`AppConfig.backup`** score fields are replaced by a deprecated open record; runtime backup no longer relies on those config keys.
- **Breaking — DB API**: **`getAllScoredImagesForBackup(minScore)`** → **`getAllScoredImagesForBackup()`**.

## [5.7.1] - 2026-04-11

### Fixed

- **Export / EXIF metadata**: **`electron/main.ts`** reads tags from the written export first, then copies standard photo fields from the source; **Orientation** prefers the exported JPEG (and **`exifOrientationBaked`**) so metadata matches preview pixels when the raw container and embedded preview disagree (e.g. some **NEF** workflows).
- **EXIF orientation bake**: **`bakeExifOrientationToBlob`** moved to **`src/utils/exportImageBake.ts`**; uses **`createImageBitmap`** with **`imageOrientation: 'from-image'`**, then falls back to **`HTMLImageElement`** so exported raster dimensions match the viewer when the bitmap path fails or returns null.

### Changed

- **Vitest**: Default **`maxWorkers`** to **`1`** (override with **`VITEST_MAX_WORKERS`**) to reduce OOM risk on constrained Windows hosts with parallel **`jsdom`** workers.

### Added

- **Tests**: Unit coverage for **`exportImageBake`** and **`useOperationStore`**.

## [5.7.0] - 2026-04-11

### Added

- **Pipeline terminology**: **`src/constants/pipelineLabels.ts`** and **`src/types/pipelineStage.ts`** — user-facing stage names aligned with the backend React app (Discovery, Inspection, Quality Analysis, Similarity Clustering, Tagging, Bird Species ID); **`docs/technical/PIPELINE_TERMINOLOGY.md`** mirrors the shared glossary.
- **`electron/mediaUrlParse`**: Shared media URL parsing helpers with unit tests (used with **`mediaUrl`** utilities).

### Changed

- **Capture date from XMP**: Gallery SQL treats **`image_xmp.create_date`** as part of the capture timestamp (with EXIF and import time); calendar-day filters and **`capture_date`** sort use the same **`COALESCE`**; sync “max capture date under tree” uses EXIF + XMP.
- **Default gallery sort**: **`getImages`** default **`sortBy`** is **`score_general`** (was **`capture_date`**).
- **Runs & job progress**: **`RunsPage`**, **`JobProgressBar`**, and **`useGalleryWebSocket`** show human-readable pipeline stage labels; Electron **`main`** / **`preload`** / **`bridge`** updated for IPC where needed.
- **`electron/db.ts`**: **`castDate()`** helper; capture fallback indicator when XMP is also missing.

## [5.6.0] - 2026-04-11

### Added

- **KonIQ / Paq2Piq sorting**: Filter bar sort options and **`getImages`** / **`getStacks`** / **`getImagesByStack`** allow **`score_koniq`** and **`score_paq2piq`**; **`GalleryGrid`** overlay shows these scores when selected.
- **General Score** sort option in the filter dropdown (explicit **`score_general`**).

### Changed

- **`electron/db.ts`**: Allowed sort columns and SELECT projections include **`score_koniq`** and **`score_paq2piq`** for gallery and stack image queries.

## [5.5.0] - 2026-04-10

### Added

- **Capture-date sort & filter**: Default gallery sort is now **Capture Date** (EXIF `DateTimeOriginal` / `CreateDate`, falling back to `created_at`). Images without EXIF dates show an orange fallback indicator.
- **CalendarPicker**: New sidebar calendar widget with dot markers on dates that have shots; queries `getDatesWithShots` endpoint.
- **`/db/dates-with-shots`** server endpoint and `getDatesWithShots` IPC/bridge method.
- **Deleted-image tracking**: `isImageDeleted()` checks `deleted_images` table to skip re-registration during Sync/Import; `getDeletedImageMatchSets()` provides original-ID and hash sets for Intelligent Backup manifest cleanup.
- **Backup config defaults**: `BackupModal` loads `minScore` and `similarityThreshold` from `config.backup` on open.

### Changed

- **Sort dropdown**: Replaced **General Score** and **Date Added** options with a single **Capture Date** option; added `capture_date` to allowed sort columns with a dedicated SQL expression.
- **`getImages` query**: `LEFT JOIN image_exif` to project `capture_date` and `is_capture_date_fallback`; column references qualified with `i.` alias.
- **`getImageCount`**: Supports `capturedDate` filter via `image_exif` subquery.
- **Types**: `ImageQueryOptions.capturedDate`, `ImageRow.capture_date` / `is_capture_date_fallback`, `AppConfig.backup.similarityThreshold`, `ScoredImageForBackup.capture_date`.
- **TODO.md**: Updated evaluation to 2026-04-10; priority tiers aligned with backend `docs/planning/INDEX.md`.

### Removed

- **Outlier detection UI**: `useOutlierMarkers` hook, `GalleryGrid` outlier badge/props, `FilterPanel` outlier toggles, and associated tests.
- **`findOutliers` IPC**: Removed from `electron.d.ts` declarations.

## [5.4.6] - 2026-04-10

### Changed

- **Development**: Cursor subagents **`gallery-electron-ts`** and **`pr-ready-hygiene`**, plus **`gallery-electron-ts`** skill for Electron/DB/API alignment and merge-readiness workflows.

## [5.4.5] - 2026-04-10

### Fixed

- **Modals**: Prevent `Sync` and `Import` modals from prematurely disappearing by keeping `<AppContent />` mounted during transient DB disconnects.
- **State**: New Zustand `useOperationStore` to track long-running sync and import operations independent of modal UI state.
- **UI**: Persistent activity pill badge in the header shows progress of background operations even when modals are closed.
- **Sync**: Restricted processing extensions to `.nef` files only in the main process.

## [5.4.4] - 2026-04-06

### Added

- **`electron/thumbnailPathNormalize`**: **`stripDockerAppThumbnailPrefix`** and **`absolutizeThumbnailPath`** (shared by **`db.ts`** and **`main.ts`**) to align with backend Docker/static thumbnail roots.

### Changed

- **`toMediaUrl`**: paths that are not Windows drive absolutes use **`media:///?path=…`** for repo-relative and similar values so Chromium does not collapse **`../`** segments in the authority.
- **Electron main**: per-request **`media://`** logging only when **`DEBUG_GALLERY_MEDIA=1`**; missing-file warnings capped (with note to enable verbose mode); path fallback logging only in dev or verbose mode.

### Fixed

- **`media://` handler**: after URL parse, thumbnail strings are passed through **`absolutizeThumbnailPath`** so Docker **`/app/thumbnails`** (and similar) map to the host thumbnail base; blocks only if the path stays non-absolute after normalization.
- **Relative `paths.thumbnail_base_dir`**: resolved from the gallery app root so **`../image-scoring-backend/thumbnails`** in config does not leave **`..`** segments that break **`media://`** resolution.

## [5.4.3] - 2026-04-05

### Added

- **Fix metadata on server**: Image viewer control calls the backend **fix-image** flow (Electron **`api:scoring-fix-image`** / **`fixImageMetadata`**, browser **`POST /backend/scoring/fix-image`**) to re-read EXIF/XMP and refresh DB fields without a full AI re-score.

### Changed

- **Vite dev proxy**: **`/gallery-api`** and **`/media`** forward to the gallery Express dev server (**`VITE_GALLERY_SERVER_URL`**, default **`http://127.0.0.1:3001`**) via **`http-proxy-middleware`** instead of the Python WebUI lock file; dev **`base`** is **`/`** so absolute proxy paths resolve correctly.

### Fixed

- **Thumbnail paths**: Collapse duplicated **`thumbnails/app/thumbnails`** segments and strip **`../image-scoring(-backend)/thumbnails/`** repo-relative prefixes when resolving DB and **`media://`** paths (**`electron/thumbnailPathNormalize.ts`**, used from **`db.ts`** and **`main.ts`**).
- **Folder mode in browser**: **`enterFolderMode`** returns **`true`** only after IPC succeeds; DB connection screen explains Vite-only limits; **`FsGallery`** shows loading / no-root messaging and **Return to database gallery**; HTTP bridge **`getLightModeRoot`** resolves to **`''`** instead of rejecting; **`setGalleryMode('db')`** still works in browser.
- **App mode**: Hydrate **`galleryMode`** from the main process on startup; **`exitFolderMode`** resets local mode in **`finally`**.

## [5.4.2] - 2026-04-04

### Fixed

- **Direct-DB import**: After **`insertImage`**, **`markImageIndexingPhaseDone`** sets **`image_phase_status`** for **indexing** to **done** (aligned with backend import-register) and marks **`folders.phase_agg_dirty`** for the image’s folder chain so folder phase aggregates stay consistent.

## [5.4.1] - 2026-04-04

### Added

- **`ThumbnailPlaceholder`**: Shared empty/error thumbnail surface; **`SimpleMediaThumb`** in **`GalleryGrid`** shows a fallback when **`media://`** URLs are not browser-decodable (e.g. NEF).
- **RAW preview loading**: Spinner (**`Loader2`**) while extracting; **`GalleryThumbnail`** resets and retries extraction on image error for RAW files.

### Changed

- **`npm run dev`**: **`concurrently`** uses **`--kill-others --success command-electron`** so stopping Vite/server tears down Electron cleanly.
- **`JobProgressBar`**: Labels for **`indexing`**, **`metadata`**, **`bird_species`**, **`pipeline`**.
- **WebSocket `job_progress`**: Forwards optional **`job_type`** into **`useJobProgressStore.updateProgress`** so the bar reflects the active phase.

### Fixed

- **PostgreSQL sorting**: **`getImages`**, **`getStacks`**, **`getImagesByStack`**, and **`getAllScoredImagesForBackup`** append **`NULLS LAST`** on descending sorts so rows without sort values do not float to the top.

## [5.4.0] - 2026-04-04

### Added
- **File → Sync**: Copy new photos from a removable drive or folder into **`destinationRoot / camera / lens / year / date`**; preview (dry run) and full sync with progress; configurable **`sync.destinationRoot`** in **`config.json`**; lens segment names prefer focal-length tokens (e.g. **`180-600mm`**) so layouts stay consistent with backend maintenance tooling.
- **File → Backup**: Back up scored images to a folder you choose, with manifest, progress, minimum score and similarity controls; backup and sync block each other while one run is in progress.
- **UI**: **`SyncModal`** and **`BackupModal`** in the database gallery flow.
- **Electron / DB**: IPC for sync preview and run, backup target check and run, import-after-sync; **`getMaxIndexedCaptureDateUnderDestRoot`**, **`getMaxIndexedCreatedDateUnderDestRoot`**, and **`getAllScoredImagesForBackup`** for planning and execution.
- **Tests**: **`lensFolderName`** unit tests for lens folder normalization.
- **`config.example.json`**: **`sync.destinationRoot`** placeholder and comment for File → Sync.

### Changed
- **AGENTS.md**, **`.github/pull_request_template.md`**: Agent workflow and PR checklist updates.

### Removed
- **`.cursor/rules` / `.cursor/skills`**: Removed bundled **mcp-firebird** and **mcp-kanban** copies; use user-level MCP configuration as documented in **AGENTS.md**.

## [5.3.1] - 2026-04-04

### Changed
- **`.gitignore`**: Ignore **`lint_results.txt`** and **`test_result.json`** for local tooling output.

## [5.3.0] - 2026-04-03

### Added
- **Vite dev proxy**: Resolves the backend base URL from **`webui.lock`** / **`webui-debug.lock`** (sibling **image-scoring-backend** or repo root) and proxies **`/gallery-api`** (with path rewrite) and **`/media`** to that host/port; logs the chosen target at config load.

### Changed
- **Postgres / `electron/db`**: **`getImageDetails`** builds **`keywords`** from **`image_keywords`** + **`keywords_dim`** (**`string_agg`** on **`keyword_display`**); stack image queries filter by keyword via **`EXISTS`** on those tables (**`keyword_display`** / **`keyword_norm`**, case-insensitive) instead of **`images.keywords LIKE`**.

### Documentation
- **environment.example.json**: **`browser_server.port`** example for the browser-mode server.

## [5.2.4] - 2026-04-02

### Documentation

- **Backlog workflow**: `docs/project/00-backlog-workflow.md` (canonical), `docs/project/BACKLOG_GOVERNANCE.md` (alias), `docs/planning/00-backlog-workflow.md` (redirect); aligned with **image-scoring-backend** and `blob/main` GitHub links.
- **CLAUDE.md**, **README.md**, **TODO.md**, **AGENTS.md**, **docs/README.md**, integration/planning mirrors: Postgres-only wording, Agent Coordination links, no hardcoded local drives in examples.
- **`.agent` / `.cursor`**: Workflow and skill copy refreshed where touched.

## [5.2.3] - 2026-04-02

### Documentation
- **AGENT_COORDINATION**: Link to **DATABASE_REFACTOR_ANALYSIS** for database refactor impact assessments.
- **DATABASE_REFACTOR_ANALYSIS**: New technical note on gallery compatibility with backend **DB_VECTORS_REFACTOR** (vectors, keywords normalization, scores fact table, stack cache).
- **Backlog & planning**: `docs/planning/00-backlog-workflow.md`, `docs/project/` (INDEX, TODO, BACKLOG_GOVERNANCE), and planning hub updates aligned with **image-scoring-backend** backlog governance.
- **Agent material**: Skills (Firebird DB, git-changelog, image-scoring MCP), `setup_env` workflow, and MCP kanban rule/skill refreshed for canonical repo names and Postgres-primary context.

## [5.2.2] - 2026-04-01

### Fixed
- **Electron startup**: **`initializeDatabaseProvider`** runs **after** the main window and menu exist so a slow or down Postgres/API check (long **`connectionTimeoutMillis`**) no longer blocks the UI from appearing; failures log a warning and the renderer can still show connection errors.
- **Browser-mode server** (`server/index.ts`): **`process.stdin.resume()`** when stdin is a non-TTY pipe so nested **`npm`** / **`concurrently`** on Windows does not let Node exit immediately after listen.

### Changed
- **`npm run dev`**: Single **`concurrently`** with named tabs (**`server`**, **`vite`**, **`electron`**) instead of nesting; **`dev:web`** names **`server`** and **`vite`**; **`dev:electron`** uses **`wait-on http://localhost:5173`** instead of **`tcp:5173`**.
- **Vite**: **`server.port`** **`5173`** and **`strictPort: true`** so dev URL and readiness checks stay aligned.
- **`config.example.json`**: Note to keep dev URL / port in sync with Vite (**`strictPort`** fails if the port is busy).

## [5.2.1] - 2026-04-01

### Fixed
- **Stack cache**: In **`ensureStackCacheTable`**, treat Postgres duplicate-table signals (**`42P07`**, case-insensitive **`already exists`**) as benign when another caller created **`stack_cache`** concurrently.

### Documentation
- **`TODO.md`**: Mark Firebird decommission / Postgres-only deep-cleanup checklist items complete under Database & Migration.
- **`docs/planning/02-firebird-postgresql-migration.md`**: Status notes deep cleanup **2026-04-01**.

## [5.2.0] - 2026-03-31

### Added
- **Folder mode UI**: **`FsGallery.module.css`** for folder-mode layout (header badge, sidebar, empty folder state, connection spinner, error screen); **`FsGallery`** empty-state when a folder has no images; **`App`** reuses those styles for “connecting” and DB error flows.
- **Gallery MCP API tools**: **`api_run_stages`** (`GET /api/runs/{run_id}/stages`), **`api_probe`** (timed GET with body preview and safe relative paths), and clearer **`api_job_status`** docs (job id ↔ workflow `run_id`).

### Changed
- **`LightModeConfig`** / **`FsSidebar`**: styling and structure cleanup aligned with the folder-mode CSS module.
- **`electron/main`**: debug payload default **`database.engine`** is **`postgres`** when unset (was **`firebird`**).
- **Comments / tests**: **`electron/db`** and **`provider.test`** wording and fixtures drop obsolete Firebird-only assumptions.
- **Docs & agent material**: architecture, migration status, coordination, workflows, and skill guides updated for Postgres-primary operation.
- **`.cursor/mcp.json`**: removed **`imgscore-el-firebird`** entry (no embedded DB credentials in repo config).

### Removed
- **`ensureFirebirdRunning`** export from **`electron/db`** — callers should use **`initializeDatabaseProvider()`** only.

## [5.1.0] - 2026-03-30

### Added
- **Folder mode**: Switch between **database** and **folder** gallery (**`AppModeProvider`** / **`useAppMode`**); filesystem UI (**`FsGallery`**, **`FsSidebar`**, **`FsImageGrid`**), pagination (**`useFsPagination`**), and **`mapFsEntryToImageRow`** for row-shaped entries.
- **Folder listing cache**: In-memory cache for **`readFsDir`** (**`fsReadDirCache`**) with subtree invalidation; **Ctrl/Cmd+Shift+R** refreshes folder listings and **raw preview** cache for the current folder (**`galleryRawPreviewCache`**).
- **Config**: Optional **`lightModeRootFolder`** (persisted via **`LightModeConfig`** / **`saveConfig`**) and **`selection.smartCoverEnabled`**.
- **Electron IPC / main**: **`readFsDir`** (paginated directories + images, totals, root), **`setGalleryMode`**, and safer per-entry **`stat`** on Windows so files are not misclassified from **`readdir`** dirents alone.
- **Dev scripts**: **`dev:web`** runs **`server`** and **Vite** together; **`vite:only`** for Vite alone; **`dev:browser`** now runs **`dev:web`**.
- **Tests**: **`fsReadDirCache.test.ts`** for cache keys and invalidation.

### Changed
- **`App`**, **`bridge`**, **`useDatabase`**, **`GalleryGrid`**, **`GalleryThumbnail`**, **`ImageViewer`**, layout CSS, **`electron` types/preload/main**, and **`electron.d.ts`** to support folder mode and the new IPC.

## [5.0.0] - 2026-03-29

### Removed
- **Direct Firebird in Electron**: Dropped **`node-firebird`**, **`FirebirdConnector`**, **`FirebirdDatabaseConfig`**, top-level **`firebird.path`**, Firebird auto-start/port checks, and dual Firebird/Postgres SQL templates. Gallery SQL is **Postgres-shaped** only (local **`pg`** or backend **`api`**).
- **Bootstrap scripts**: Removed **`scripts/start_db.ps1`**, **`scripts/patch-node-firebird.js`**, **`npm run db:start`**, and **`postinstall`** patching.

### Changed
- **`DatabaseEngine`**: **`postgres` | `api`** only; **`normalizeAppConfig`** maps non-API configs to **Postgres** with defaults when fields are omitted (**`localhost`**, **`5432`**, **`image_scoring`**, etc.).
- **`npm run dev`**: Runs **Vite + Electron** only (no bundled DB start).
- **`createDatabaseConnector`**: Legacy raw **`engine: firebird`** (runtime string) still routes to **Postgres** when **`database.postgres`** is present; types no longer advertise Firebird.
- **Planning doc**: **`02-firebird-postgresql-migration.md`** marked completed for the Electron alignment items.

## [4.6.0] - 2026-03-29

### Added
- **Tools menu**: **Runs**, **Duplicates**, and **Embeddings** open the matching gallery views via IPC (**`open-runs`**, **`open-duplicates`**, **`open-embeddings`**).
- **Preload / bridge**: **`onOpenEmbeddings`** subscription (Electron + browser **`noop`** stub).

### Changed
- **Sidebar**: Gallery uses a **Back** control (parent folder or stack) instead of a four-tab view switcher; **Runs** / **Duplicates** / **Embeddings** return via **Gallery**. Removed the sidebar DB connection line ( **`AppContent`** no longer takes **`isConnected`**).
- **`RunsPage`**: Dropped the header **← Gallery** button; use sidebar **Gallery**.
- **`FilterPanel`**: **Color Label** block wrapped with **`section`** styling for consistency with other blocks.

## [4.5.0] - 2026-03-29

### Added
- **Tag propagation types**: Optional **`focus_image_id`** on **`TagPropagationRequest`** in **`electron/apiTypes.ts`** and **`src/electron.d.ts`** — dry-run preview for a focused image even when it already has keywords (server strips existing tags from suggestions).

## [4.4.2] - 2026-03-27

### Added
- **Image viewer**: **Image ID** in metadata is a clickable control (when **`onOpenImageById`** is wired) to focus that image in the gallery list.
- **Tests**: **`src/utils/mediaUrl.test.ts`** for **`toMediaUrl`** in browser mode and Electron (Windows drive and WSL-style **`/mnt/...`** paths).

### Fixed
- **`media://` on Windows**: **`toMediaUrl`** emits **`media:///...`** so drive letters remain in the URL pathname; **`electron/main`** **`parseMediaUrlToFilePath`** maps custom-protocol requests correctly (including Chromium’s **`media://D:/...`** host/path split and WSL paths).

### Changed
- **Preload `extractNefPreview`**: Explicit TypeScript typing for the unwrapped IPC result.

## [4.4.1] - 2026-03-27

### Removed
- **NEF LibRaw tier**: Dropped **`libraw-wasm`**, **`sharp`**, **`decodeRaw`**, and **`src/libraw-wasm.d.ts`**; previews use IPC / existing client-side extraction paths only.
- **Repo clutter**: Removed ad-hoc root scripts (**`compare_db*.py`**, **`check_orientation.js`**, **`fix_thumbnails.js`**, **`test_*.js`**, **`verify.js`**), **`build_exe.bat`**, and stray logs/reports/patches.

### Changed
- **`BackendJobInfo`**: Exported from **`src/electron.d.ts`** with **`input_path`** / **`log`**; **`RunsPage`** imports from **`electron.d`** and types log line splits.
- **Main process**: Removed unused **`parseMediaUrlToFilePath`** helper.
- **`AppContent`**: Dropped unused **`loadStackImagesRef`** destructure.

### Fixed
- **Preload `extractNefPreview`**: Unwraps the IPC **`Envelope`** like other invoke handlers.
- **ImageViewer**: Explicit EXIF field casts for stricter TypeScript.

## [4.4.0] - 2026-03-26

### Added
- **Database `api` engine**: **`ApiConnector`** runs gallery SQL against the Python backend over HTTP (see backend **`/api/db/query`**); configure **`database.engine`: `api`** and **`database.api`** (`url`, optional **`dialect`** / **`sqlDialect`** for Firebird vs Postgres-shaped queries).
- **`IDatabaseConnector`** / **`createDatabaseConnector`**: Unified Firebird, Postgres, and API paths in **`electron/db/provider.ts`**; **`electron/db.ts`** resolves SQL dialect for API mode from config.
- **Dependencies**: **`pg`** and **`@types/pg`** for the Postgres connector.
- **`electron/db/provider.test.ts`**: Vitest coverage for connector selection and **`?` → `$n`** translation for Postgres.
- **`docs/planning/db_abstraction_layer.md`**: Notes on the connector abstraction.

### Changed
- **Main process**: Shared **`findActiveWebuiPort`** for lock-file discovery; **Scoring** window title **Image Scoring**, no menu bar; **`nef:extract-preview`** uses **`wrapIpcHandler`** like other IPC handlers.
- **`electron/types.ts`** / **`src/electron.d.ts`**: **`DatabaseEngine`** includes **`api`**; **`ApiDatabaseConfig`** added.

## [4.3.0] - 2026-03-26

### Added
- **Scoring window** (**Tools** → **Scoring...**): Loads the backend React UI at **`/ui/runs`**. When sibling **`image-scoring-backend/static/app`** (or legacy **`image-scoring/static/app`**) exists, a local **Express** server serves the SPA and **proxies** `/api`, `/public`, `/source-image`, and **`/ws`** to the configured FastAPI base URL so the window still works if `:7860` only exposes API/WebSocket; otherwise falls back to opening the backend URL directly. Window icon uses backend **`static/favicon.ico`** when present.
- **`electron/scoringUiServer.ts`**: **`startScoringUiServer`**, **`resolveBackendUiStaticDir`**, dynamic proxy target via **`http-proxy-middleware`** (new dependency).
- **`--webui-shell=URL`**: Minimal Electron mode that opens a single **WebUI** window and **quits** when it closes (e.g. external launcher).

### Changed
- **Tools** menu: **Diagnostics** first, separator, then **Scoring...**; removed separate **Find Duplicates** and **Runs** entries (use gallery/viewer flows and the Scoring UI for runs).
- **Gallery grid**: Removed thumbnail context menu **Find similar images** and **`onFindSimilarImages`** prop.
- **Image viewer**: Removed **`SimilarSearchDrawer`** integration and **`initialSimilarSearchImageId`** prop; related opener wiring trimmed (**`AppContent`**, **`useImageOpener`**).

## [4.2.1] - 2026-03-25

### Fixed
- **Diagnostics**: Help → **Diagnostics** menu, **`system:get-diagnostics`** IPC, preload **`getDiagnostics`** / **`getProcessMemoryInfo`** / **`onOpenDiagnostics`**, **`ApiService.getBaseUrl`**, and browser **bridge** stubs so the modal reflects live DB/API status (wires up 4.2.0 **DiagnosticsModal**).
- **DuplicateFinder**: Pair previews use **`toMediaUrl`** instead of **`file://`** URLs.

## [4.2.0] - 2026-03-24

### Added
- **DiagnosticsModal**: New system diagnostics panel showing DB/API connectivity status, software versions (Electron, Node.js, Chrome, V8), host OS info, and main/renderer process memory usage.

## [4.1.0] - 2026-03-24

### Added
- **Browser mode**: Run the gallery without Electron — Express server **`server/index.ts`** exposes **`/gallery-api/*`** (DB, config, Python API proxy) and **`/media/*`** for thumbnails; **`npm run dev:browser`** starts server + Vite; **`npm run server`** / **`start:browser`** for standalone or production static.
- **`src/bridge`**: Lazy proxy over **`window.electron`** (Electron) or HTTP **`fetch`** (browser); renderer code uses **`bridge`** instead of **`window.electron`**.
- **Dependencies**: `express`, `@types/express`; **`electron/apiService`** uses **`globalThis.fetch`** when Electron **`net`** is unavailable.

### Changed
- **Vite**: Dev proxy for **`/gallery-api`** and **`/media`** to the browser-mode server (default port 3001).
- **`mediaUrl`**: **`toMediaUrl`** returns **`/media/...`** in browser mode, **`media://`** in Electron.
- **`config.json`**: Explicit **`database.engine`** / **`provider`** for Firebird; **`selection`** block removed (see Removed).

### Removed
- **`SelectionSettings`** component and its use from **Settings** modal.

### Fixed
- **Express 5** / **`path-to-regexp` v8**: Wildcard routes use named params (**`/backend/*path`**, **`/media/*filePath`**, SPA **`/*path`**) so the server starts and **`/gallery-api/ping`** works.

## [4.0.0] - 2026-03-21

### Added
- **Runs**: **`RunsPage`** / **`RunsConsole`** replace the old Processing screen — recent jobs (API polling), queue depth, create-run controls, and WebSocket-backed log buffer via **`useRunsStore`** (buffered worker/pipeline lines with clear/reset).

### Changed
- **Application menu**: **Processing** renamed to **Runs**; opens the Runs view.
- **`useFolders`**: Initial load shows loading only on first fetch; folder list uses DB rows directly (no merge with `getScopeTree` phase columns).
- **`buildFolderTree`**: Path-based parent linking when **`parent_id`** is missing or stale (normalized path keys, Windows drive roots).
- **`db:list-folders`**: Drops entries whose path is not a directory (async stat filter).

### Removed
- **Processing UI**: `ProcessingPage`, `ProcessingConsole`, `ProcessingControls`, `ProcessingPhaseCard`, and **`useProcessingStore`**.

### Breaking
- **Preload / IPC**: **`onOpenProcessing`** → **`onOpenRuns`**; main channel **`open-processing`** → **`open-runs`**. Renderer **`currentView`** union uses **`'runs'`** instead of **`'processing'`**. Update any code or tests that referenced the old names.

## [3.46.0] - 2026-03-21

### Added
- **`config.json` `paths`**: Thumbnail base directory, legacy thumbnail path remaps (`image-scoring` → `image-scoring-backend`), and `remap_legacy_image_scoring_thumbnails` flag.

### Changed
- **`config.json`**: Firebird database and client paths aligned with sibling `image-scoring-backend` layout (relative paths).
- **`.cursor/mcp.json`**: Some MCP servers disabled by default (SSE, Playwright, Chrome DevTools); Firebird MCP `disabledTools` list extended.
- **`.claude/settings.json`**: Claude Code allowlist and `additionalDirectories` updated for `imgscore-el-*` MCP tools and explicit gallery/backend project paths.

## [3.45.0] - 2026-03-21

### Added
- **GalleryThumbnail**: Grid tile component for web-safe formats via `media://`, RAW via embedded preview extraction (same strategy as ImageViewer), with LRU cache (`galleryRawPreviewCache`) and `rawPreviewLimiter` concurrency.
- **`imageFormats` / `mediaUrl`**: Helpers (`isWebSafe`, `isRaw`, `toMediaUrl`) including `media://local/...` for Windows drive letters so Chromium does not mangle hosts.
- **`.cursor/commands/release`**: Documented semver release workflow for this repo.

### Changed
- **`media://` handler** (`main.ts`): Strips `media://` and optional `local/` prefix; keeps absolute-path validation before `path.resolve`; thumbnail path fallbacks (repo rename, nested `thumbnails/<aa>/` layout).
- **`db.ts`**: Expanded image/path handling and thumbnail resolution aligned with backend path options.
- **Gallery / viewer / similar search**: Use the new thumbnail stack and utilities; minor IPC-related wiring.
- **Config & tooling**: `config.example.json` and `mcp-server` config for gallery/backend paths; `scripts/start_db.ps1` updates; workspace file renamed to `image-scoring-gallery.code-workspace`.
- **Docs & agent metadata**: Paths and naming aligned with `image-scoring-backend` / `image-scoring-gallery` sibling layout.

## [3.44.1] - 2026-03-20

### Fixed
- **`media://` Windows paths**: `toMediaUrl` now emits `media:///D:/...` (three slashes) so Chromium does not parse `D:` as the URL host (which produced `media://d/Projects/...` and broken file loads). The main-process handler checks `path.isAbsolute(filePath)` **before** `path.resolve()` so relative paths from bad parses are rejected instead of resolving under the app CWD.
- **`media://` thumbnails**: If the resolved file is missing, try the same path under `...\image-scoring\thumbnails\` (JPEGs not copied after renaming the repo to `image-scoring-backend`), then try nested `thumbnails\<aa>\<hash>.jpg` when the DB has a flat `thumbnails\<hash>.jpg` path.

## [3.44.0] - 2026-03-19

### Changed
- **MCP**: `.cursor/mcp.json` server naming and transport alignment with image-scoring workspace merge.
- **Docs**: `AGENTS.md`, Firebird MCP rule (`.cursor/rules/mcp-firebird.mdc`), image-scoring MCP skill copy.

### Fixed
- **Gallery thumbnails**: Grid and similar-search tiles no longer point `<img>` at `.NEF`/RAW files (browsers cannot decode them). Prefer `thumbnail_path` JPEGs; otherwise use the same embedded-JPEG extraction path as the viewer, with a small concurrency limit and LRU blob cache. **`media://` handler** now uses `pathToFileURL` for correct Windows `file:` URLs and allows absolute paths without the old `:` heuristic that blocked UNC locations.
- **Thumbnail paths from DB**: List/detail queries now load `thumbnail_path_win` and resolve **`thumbnail_path` for the renderer** (Windows prefers the native column, matching Python `get_thumb_win`). Default remap **`.../image-scoring/thumbnails/` → `.../image-scoring-backend/thumbnails/`** when the backend repo was renamed; **`paths.thumbnail_base_dir`** (absolute thumbnails root on your machine) joins repo-relative DB paths; **`paths.thumbnail_path_remap`** handles other prefixes. `config.json` / `config.example.json` include the usual layout.

## [3.43.0] - 2026-03-19

### Changed
- **apiService**: `getScopeTree` now passes `include_phase_status: false` by default.
- **db**: Added `stripConcatenatedAbsolutePath` to fix erroneously concatenated paths (e.g. `D:/repo/.../D:/Photos/...`) in folder creation and path normalization.
- **AppContent**: Header label shows "items (grouped)" instead of "stacks" when in stacks mode.

## [3.42.0] - 2026-03-18

### Changed
- **useDatabase**: Refactored hook with improved state handling.
- **ProcessingPage, ProcessingControls**: UI refinements.
- **FolderTree**: Component updates.
- **NotificationTray**: Minor improvements.
- **AppContent**: Cleanup.
- **apiService, preload**: API and IPC updates.
- **Tests**: useDatabase, useDataHooks, useImages, Logger, WebSocketService, apiClient test updates.

## [3.41.2] - 2026-03-17

### Fixed
- **ImageViewer**: Only update image state when target ID changes to avoid infinite re-render when parent passes new `allImages` reference each render.

## [3.41.1] - 2026-03-15

### Fixed
- **apiService**: Extended params type to support `boolean` in `request`, `get`, and `getImages` for API query parameters.

## [3.41.0] - 2026-03-15

### Added
- **Session log manager**: `electron/sessionLogManager.ts` with tests.

### Changed
- **apiService**: Extended with additional API methods.
- **apiTypes**: Expanded type definitions for backend contract.
- **validate-api-types**: Improved validation script.

## [3.40.0] - 2026-03-14

### Changed
- Version bump to 3.40.0.

## [3.39.0] - 2026-03-14

### Added
- **Job progress bar**: `JobProgressBar` component and `useJobProgressStore` for real-time pipeline job progress display.
- **API contract sync**: `scripts/sync-api-contract.mjs` and `api-contract/openapi.json` for generated API types.
- **Generated API types**: `electron/api.generated.ts` from OpenAPI schema for type-safe backend calls.

### Changed
- **apiService**: Extended with job progress and pipeline status methods.
- **MainLayout**: Integrated job progress bar into layout.
- **IPC**: Added `job:get-progress` handler for progress polling.

### Removed
- **apiClient.ts**: Replaced by apiService and generated types.

## [3.38.0] - 2026-03-13

### Added
- **apiUrlResolver**: Extracted backend URL resolution (config → lock file → default) for testability.
- **Vitest**: Test config and unit tests for apiUrlResolver, treeUtils, useKeyboardLayer, Logger, WebSocketService.

### Changed
- **apiService**: Uses apiUrlResolver for base URL; improved config handling.
- **useDatabase**: Refactored; electron.d.ts type updates.
- **Docs**: Embeddings feature docs updates.

## [3.37.0] - 2026-03-13

### Changed
- **Tag propagation feedback**: Replaced `alert()` with in-app notifications for tag propagation success and failure in ImageViewer.

### Fixed
- **ESLint**: Replaced `any` with `Record<string, unknown>` in main.ts exiftool metadata handling.
- **ESLint**: Added `image.id` to ImageViewer EXIF effect dependency array.
- **ESLint**: Added `release-builds-v2` to global ignores.

## [3.36.1] - 2026-03-13

### Removed
- **Gradio client**: Removed unused `gradioClient.ts` and `@gradio/client` dependency; integration uses REST API and WebSocket only.

### Fixed
- **ImageViewer EXIF loading**: Fixed race condition where Photography Stats could remain stuck in "Loading camera data..." when EXIF was available from the database; now clears `exifLoading` at effect start and in the early-return path.

## [3.36.0] - 2026-03-13

### Added
- **useKeyboardLayer hook**: Layered keyboard handling with priority (page, drawer, menu, modal) for correct Escape key behavior across context menus, viewer, and navigation.
- **ConfirmDialog**: Reusable shared component for confirmation dialogs with focus trap and Escape handling.
- **Design tokens**: Added `tokens.css` for consistent theming; new CSS modules for breadcrumbs, toggles, gallery grid, notification tray, filter panel.

### Changed
- **GalleryGrid**: Migrated inline styles to CSS modules; improved context menu keyboard handling via `useKeyboardLayer`.
- **NotificationTray**: Extracted styles to `NotificationTray.module.css`.
- **FilterPanel**: Extracted styles to `FilterPanel.module.css`; added `aria-label` for color label buttons.
- **AppContent**: Breadcrumbs and Stacks/Subfolders toggles now use shared CSS modules; added `aria-label`, `role="switch"`, `aria-checked` for accessibility.
- **ImageViewer**: Improved layout and styling.
- **FolderTree**: Minor refinements.
- **Export metadata**: ExifTool now uses `-overwrite_original` to avoid leaving backup files on export.

### Fixed
- **GalleryGrid remount**: Added `key` prop to force remount when switching between stacks/images mode or folder, preventing stale state.

## [3.35.1] - 2026-03-10

### Added
- **Database Schema Management**: `fix_thumbnails.js` now automatically checks for and adds the `ORIENTATION` column if missing.
- **Improved Scripts**: Added support for `DB_PATH` environment variable in maintenance scripts for better portability.

### Changed
- **Documentation**: Replaced local absolute paths with GitHub repository links for better portability and consistency.
- **Configuration**: Updated `config.example.json` with current best practices and Firebird path examples.
- **Linting**: Added `release-builds` to global ignores in `eslint.config.mjs`.
- **Roadmap**: Updated `docs/planning/01-roadmap-todo.md` with recent progress and prioritized embedding integration.

### Fixed
- **Thumbnail Rotation**: Enhanced `fix_thumbnails.js` to correctly apply EXIF orientation to generated thumbnails.

## [3.35.0] - 2026-03-10

### Added
- **Agent Coordination Documentation**: Formalized cross-project integration protocols between frontend and backend in [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md).
- **Cross-Project Linking**: Linked agent coordination guide in `AGENTS.md` and `docs/README.md`.

## [3.34.0] - 2026-03-10

### Added
- **Gradio Client Integration**: Added `src/services/gradioClient.ts` for AI model api interfacing.
- **MCP Server Tools**: Added specific tool actions to `mcp-server/`.
- **Documentation**: Added `CLAUDE.md`.

### Changed
- Refactored `electron/apiService.ts` and `electron/db.ts`.
- Updated app icons for better visual consistency.

## [3.33.1] - 2026-03-09

### Fixed
- **Stacks keyword/label filter**: Keyword and color label filters now correctly apply to stacked images via `EXISTS` subqueries, so only stacks containing matching images are shown.
- **node-firebird crash**: Patched `node-firebird@1.1.9` to guard against `TypeError: Cannot set properties of undefined (setting 'lazy_count')` when the callback queue drains before all socket data is processed.

### Added
- **Postinstall patch script**: `scripts/patch-node-firebird.js` automatically re-applies the node-firebird crash fix after `npm install`.

## [3.33.0] - 2026-03-09

### Changed
- **Documentation structure**: Finalized docs hierarchy with `architecture`, `features`, `guides`, `planning`, and `reports`; removed legacy `docs/project` and `docs/technical` layouts.

## [3.32.0] - 2026-03-08

### Added
- **Documentation Overhaul**: Completely restructured the `docs/` directory into a logical hierarchy (`architecture`, `features`, `guides`, `project`) for better maintainability.
- **Centralized Indexing**: Created a new structured documentation index in `docs/README.md` and updated the root `README.md`.

### Changed
- **Roadmap Actualization**: Updated `docs/project/TODO.md` to reflect recently completed system hardening, including Database Connection Pooling, IPC Response Envelopes, and Secure Media Protocol.
- **Embedding Documentation Consolidation**: Grouped specialized embedding application documents into a dedicated `docs/technical/features/embeddings/` subdirectory.

## [3.31.0] - 2026-03-07

### Added
- **ApiService**: Centralized REST API client (`electron/apiService.ts`) for the Python backend (FastAPI at :7860), wrapping all HTTP calls with typed methods.
- **apiTypes.ts**: TypeScript interfaces mirroring the FastAPI Pydantic models for health, scoring, tagging, clustering, similar search, and pipeline operations.

### Changed
- **Main process**: Refactored IPC handlers to use `ApiService` instead of inline `net.fetch()` calls for backend API operations.
- **Preload**: Exposes API-related IPC handlers and type definitions to the renderer via `electron.d.ts`.
- **ImageViewer**: Refactored and improved component structure.

## [3.30.0] - 2026-03-07

### Added
- **Image Import Capability**: Added a "Import folder" option to the File menu, allowing users to scan local directories and add images to the database.
- **Import Progress UI**: New `ImportModal` component with real-time feedback, showing file counts, current progress, and detailed error reporting.
- **Deduplication on Import**: Automatic extraction of unique image identifiers (UUIDs) from EXIF metadata during import to prevent duplicate entries.
- **Enhanced Database API**: Added robust folder creation and image insertion methods to the database service with path normalization.

### Changed
- **Application Menu**: Reorganized the main menu to include an "Import" option under File and moved "Find Duplicates" to a new "Tools" menu.

### Fixed
- **Path Consistency**: Improved handling of WSL-to-Windows path conversions and normalization for stored file paths.

## [3.29.1] - 2026-03-07

### Added
- **Recursive Folder Scan**: Added a "Subfolders" toggle to the gallery header, allowing users to include images from all nested subdirectories in the current view.
- **Support Scripts**: Added `scripts/extract_preview.js` and `scripts/remove_duplicates.js` for enhanced metadata extraction and duplicate image management.

### Fixed
- **Tree View Blocking**: Implemented interaction blocking for the folder tree during initial image grid loading to prevent race conditions and improve UI stability.
- **Stacks and Subfolders Interaction**: Fixed an issue where clicking a stack would display subfolders instead of the stack images when the "Subfolders" mode was active.
- **Image List Loading Spinner**: Implemented a centered loading spinner and screen dimming overlay for initial grid load states, and a subtle corner badge for subsequent loads or pagination.



## [3.29.0] - 2026-03-07

### Added
- **Manual Keyword Fetching**: Added a `fetch` function to the `useKeywords` hook to allow manual triggering of keyword data retrieval.

### Changed
- **UI Layout**: Moved the "Subfolders" toggle from the main gallery header into the left sidebar, styling it as a consistent "ON/OFF" switch alongside the "Stacks" control.
- **Settings UI**: Renamed "Configurations" tab to "Settings" for better clarity and consistency across the application.
- **UI Refinement**: Cleaned up `AppContent.tsx` by removing obsolete tab modules and streamlining component registration.
- **Type Safety**: Improved TypeScript definitions for IPC handlers and database types to ensure more robust inter-process communication.

## [3.28.0] - 2026-03-05

### Added
- **Visual Search**: Added "More Like This" feature to find visually similar images from the image viewer or duplicates finder.
- **EXIF Metadata Display**: Enhanced the image viewer info panel to display UUID, ISO, Shutter Speed, and Aperture.
- **Similar Search Drawer**: Added a new sliding drawer for managing visually similar search results.

## [3.27.0] - 2026-03-05

### Added
- **Duplicates UI**: Initial implementation of the `Duplicates` component for managing visually similar images.
- **Settings UI**: New `Settings` component for application-wide configuration.
- **UUID Management**: Added `scripts/add_uuids.js` and `scripts/sync_backup_uuids.js` for robust image tracking using unique identifiers.
- **Type Safety**: New `electron/types.ts` and refined TypeScript definitions across the codebase to reduce `any` usage.

### Changed
- **Code Quality**: Significant linting audit and refactoring of `src/components`, `src/hooks`, and `src/services` to meet strict ESLint rules.
- **NEF extraction**: Improved `nefViewer.ts` and `libraw-wasm` integration for better raw image handling.

### Fixed
- **API and WebSocket**: Robust error handling in `WebSocketService.ts`.
- **Tree Navigation**: Fixed edge cases in `treeUtils.ts` for large folder structures.

## [3.25.0] - 2026-03-03

### Added
- **Error Boundary**: Added a global `ErrorBoundary` component to catch and display rendering errors gracefully in the UI.
- **Frontend Refactoring**: Extracted core gallery and sidebar logic from `App.tsx` into a new `AppContent` component for better maintainability and state isolation.
- **Developer Documentation**: Added `CODE_DESIGN_REVIEW.md` and Gradio integration documentation to `docs/technical/`.

### Changed
- **Path Handling**: Improved path sanitization and WSL-to-Windows conversion in the `media://` protocol handler to prevent traversal attacks and handle native Windows paths more robustly.

### Fixed
- **IPC Race Condition**: Resolved an application hang during startup by ensuring all IPC handlers are registered before the Electron window is created.
- **DB Connection Stability**: Improved reliability of the initial database connection check and event listener setup.

## [3.24.1] - 2026-02-27

### Fixed
- Fixed an issue where the Stacks view would fail to display correctly by correcting the `rebuildStackCache` SQL query.
- Fixed stack cache rebuild logic to properly queue overlapping rebuild requests and UI to refresh upon completion.
- Fixed keyword data retrieval and updating in the database bounds (added missing CAST and allowed field).

## [3.24.0] - 2026-02-26

### Added
- **Image export from viewer**: Export the currently displayed preview image to disk via the `File → Export` menu in the Electron shell.

### Changed
- Keywords display and editing in the image viewer now support inline chips with add/remove behavior while keeping the `keywords` field in sync with saved metadata.

## [3.23.0] - 2026-02-26

### Added
- **Folder deletion**: Remove empty folders from the database via delete button in the folder tree (database records only; files on disk are not removed).
- **MCP Firebird integration**: Added `.cursor/rules/mcp-firebird.mdc` rule and MCP config for database diagnostics.
- **mcp-server**: New MCP server package for Firebird tooling.

### Changed
- Database queries now exclude thumbnail paths from `file_paths` when resolving `win_path`.
- `getFolders` now includes `image_count` per folder for tree display.
- Added `win_path` fallback when missing (construct from `file_path` on Windows).
- Test environment detection: automatically switches to `SCORING_HISTORY_TEST.FDB` when `NODE_ENV=test` or `VITEST`.

### Fixed
- Discard invalid `win_path` values when extension mismatches `file_name` (bad data in `file_paths`).

## [3.22.0] - 2026-02-19

### Added
- **DB Connection Status**: Added a real-time database connection status indicator (Connected/Disconnected) to the folders sidebar.
- **Image Deletion**: Implemented functionality to delete image records from the database directly from within the `ImageViewer`.
- Added `firebird` path configuration to `config.json` for flexible deployment.

## [3.21.0] - 2026-02-15

### Added
- **WebSocket integration**: Implemented `WebSocketService` to handle real-time event broadcasting from the Python scoring pipeline.
- **Notification System**: Added `NotificationTray` component and `useNotificationStore` for displaying system-wide alerts (success, info, warning, error).
- **Real-time Event Handling**: Added listeners in `App.tsx` for `stack_created`, `folder_discovered`, `job_started`, and `job_completed`.
- **IPC Enhancement**: Added `system:get-api-config` handler for dynamic API port discovery via lock files.

### Changed
- Improved path conversion for WSL-to-Windows paths in `electron/main.ts`.
- Refactored `App.tsx` to handle dynamic stack cache rebuilding on external events.

## [3.20.0] - 2026-02-15

### Added
- **New Skills**: Added `serena-integration` (for Serena MCP usage) and `scoring-pipeline` (core architecture docs) to `.agent/skills/`.
- **New Workflow**: Added `consult_serena` workflow for structured agent interactions.

### Removed
- Removed deprecated `agent-mailbox` skill and related workflows (`check_agent_mailbox`, `send_agent_mailbox`) to simplify agent tooling.

### Changed
- Refactored `src/App.tsx` and `electron/main.ts` to support improved agent integration and clean up unused code.

## [3.19.0] - 2026-02-14

### Changed
- Unified Agent Protocol: Standardized agent IDs to `electron-gallery.agent` and `image-scoring.agent` for consistent inter-project communication.
- Updated `electron-image-scoring` skills and workflows to use the new protocol.
- Simplified `send_agent_mailbox` workflow to be non-interactive.

## [3.18.0] - 2026-02-14

### Added
- **Stacks mode** for the gallery: toggle between individual images and grouped stacks via a sidebar switch.
- Stack cards with visual stacked-layer effect, image count badge, and representative thumbnail.
- Click a stack to drill into its images; "Back to Stacks" button and Escape key to navigate out.
- `stack_cache` table in Firebird for pre-computed MIN/MAX score aggregates per stack, with automatic rebuild on first use.
- 4 new IPC endpoints: `getStacks`, `getImagesByStack`, `getStackCount`, `rebuildStackCache`.
- `useStacks` React hook for paginated stack loading with filter/sort support.
- Non-stacked images displayed as single-item entries alongside stacks.

### Changed
- Refactored `GalleryGrid` to support dual display modes (images vs. stacks) with shared score display and label color helpers.
- Image viewer now operates on the correct image list (stack images when inside a stack, all images otherwise).

### Added (Developer Tooling)
- `.agent/skills/` directory with Antigravity skill definitions for electron-dev, firebird-db, gallery-ui, git-changelog, image-scoring-mcp, agent-mailbox, and moltbook.

## [3.17.0] - 2026-02-12

### Added
- New scoring model support: SPAQ, AVA, and LIQE integration in the database and viewer.
- Percentage-based score display in the gallery view for better interpretability.
- Dynamic metadata display in gallery items, automatically switching based on selected sort criteria (Date, ID, or specific quality scores).
- Support for sorting and filtering by the new scoring models (SPAQ, AVA, LIQE).

### Changed
- Refactored database queries to include new scoring columns in results.
- Updated Gallery UI to support dynamic metadata overlays.

### Fixed
- Improved git documentation and configuration for better agent integration.


### Added
- In-viewer editing of image metadata: title, description, rating, and color label directly from the image viewer.
- Delete image from database via the image viewer (database record only; file on disk is not removed).
- Edit mode toggle with Save/Cancel controls and inline form fields for title, description, rating dropdown (0–5), and label color picker.

## [3.15.0] - 2026-02-09

### Added
- Configurable database connection parameters (host, port, user, password) in `config.json` for flexible deployment.
