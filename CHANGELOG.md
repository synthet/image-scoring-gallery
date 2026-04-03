# Changelog

All notable changes to this project will be documented in this file.

## [5.2.3] - 2026-04-02

### Documentation
- **AGENT_COORDINATION**: Link to **DATABASE_REFACTOR_ANALYSIS** for database refactor impact assessments.
- **DATABASE_REFACTOR_ANALYSIS**: New technical note on gallery compatibility with backend **DB_VECTORS_REFACTOR** (vectors, keywords normalization, scores fact table, stack cache).

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
- **Thumbnail paths from DB**: List/detail queries now load `thumbnail_path_win` and resolve **`thumbnail_path` for the renderer** (Windows prefers the native column, matching Python `get_thumb_win`). Default remap **`.../image-scoring/thumbnails/` → `.../image-scoring-backend/thumbnails/`** when the backend repo was renamed; **`paths.thumbnail_base_dir`** (e.g. `D:\\Projects\\image-scoring-backend\\thumbnails`) joins repo-relative DB paths; **`paths.thumbnail_path_remap`** handles other prefixes. `config.json` / `config.example.json` include the usual layout.

## [3.43.0] - 2026-03-19

### Changed
- **apiService**: `getScopeTree` now passes `include_phase_status: false` by default.
- **db**: Added `stripConcatenatedAbsolutePath` to fix erroneously concatenated paths (e.g. `D:/Projects/.../D:/Photos/...`) in folder creation and path normalization.
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
