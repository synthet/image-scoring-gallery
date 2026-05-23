# Desktop shell and navigation

**Purpose:** Run the gallery as an **Electron** desktop app with a **Vite** renderer: window lifecycle, menus, optional **WebUI-only** shell mode, and navigation across gallery grid, viewer, import, semantic search, and settings.

**User-visible behavior:** Standard window chrome; folder sidebar and gallery modes (`app:set-gallery-mode`, `fs:*` vs DB-backed views); **Tools → Search** for CLIP text-to-image search (folder-scoped via sidebar selection); pipeline stage labels from [`src/constants/pipelineLabels.ts`](../../../src/constants/pipelineLabels.ts); backup and export flows via IPC.

**Primary code paths:** `electron/main.ts` (window, IPC registration, `webuiShellOnlyUrl` branch), `electron/preload` (exposes safe APIs — follow preload for exact channel names), `src/components/` (e.g. `Gallery/`, `Search/`, `Import/`, `Viewer/`).

**Backend coupling:** Semantic search calls the Python API (`GET /api/similarity/text-search`, `GET /api/similarity/example-queries`). Run orchestration and other operator pages remain on **`/ui/`** when the sibling WebUI is running — see [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md).

**Related docs:** [01-system-overview.md](../../architecture/01-system-overview.md) · [PIPELINE_TERMINOLOGY.md](../../technical/PIPELINE_TERMINOLOGY.md)
