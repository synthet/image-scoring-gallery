# Desktop shell and navigation

**Purpose:** Run the gallery as an **Electron** desktop app with a **Vite** renderer: window lifecycle, menus, optional **WebUI-only** shell mode, and navigation across gallery grid, viewer, import, semantic search, and settings.

**User-visible behavior:** Standard window chrome; folder sidebar and gallery modes (`app:set-gallery-mode`, `fs:*` vs DB-backed views); **Tools → Search** for CLIP text-to-image search; pipeline stage labels from [`src/constants/pipelineLabels.ts`](../../../src/constants/pipelineLabels.ts); backup and export flows via IPC.

### Semantic search and the left sidebar

In **Semantic Search** mode the same left sidebar drives the query (not the gallery grid):

| Control | Role in search |
|--------|----------------|
| **Back to Gallery** | Exits search (sidebar green button; replaces folder-parent back) |
| **Folder tree** | Search scope — no folder = whole library; pick a folder to limit results; changing folder re-runs the last query |
| **Include subfolders** | Passes `folder_ids` to the API (parent + descendants) |
| **Keyword dropdown** | Optional AND filter on catalog keywords (does not replace the CLIP query) |
| **Sort by / order** | Secondary sort after vector relevance (`capture_date`, `rating`, `score_general`, …) |
| **Minimum rating / color label / shot date** | Server-side filters on `GET /api/similarity/text-search` |
| **Stacks** | Hidden in search mode (gallery only) |

The search bar keeps **query**, **result limit**, and **min similarity**. Active scope and filters appear as chips above the result grid.

**Code:** `src/components/Search/SearchPage.tsx`, `src/utils/textSearchParams.ts`, `src/AppContent.tsx`.

**Primary code paths:** `electron/main.ts` (window, IPC registration, `webuiShellOnlyUrl` branch), `electron/preload` (exposes safe APIs — follow preload for exact channel names), `src/components/` (e.g. `Gallery/`, `Search/`, `Import/`, `Viewer/`).

**Backend coupling:** Semantic search calls the Python API (`GET /api/similarity/text-search`, `GET /api/similarity/example-queries`). Run orchestration and other operator pages remain on **`/ui/`** when the sibling WebUI is running — see [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md).

**Related docs:** [01-system-overview.md](../../architecture/01-system-overview.md) · [PIPELINE_TERMINOLOGY.md](../../technical/PIPELINE_TERMINOLOGY.md)
