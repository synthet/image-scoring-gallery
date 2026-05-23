# Code Review — Reveal in Explorer + CullingInsightsPanel removal (2026-05-23)

## Scope

PR #93 (`feat/culling-analytics`, merged into `main` as `e9893c2`).

Files reviewed:
- `electron/main.ts` — new `currentSelectionPath` global, "Reveal in Explorer" menu item, `app:set-selection-path` IPC handler
- `electron/preload.ts` — `setSelectionPath` bridge exposure
- `src/AppContent.tsx` — `useEffect` syncing folder selection to main; removal of `CullingInsightsPanel`
- `src/bridge.ts` — HTTP-mode stub for `setSelectionPath`
- `src/electron.d.ts` — type declaration

Method: three independent finder angles (line-by-line, removed-behavior, cross-file tracer) → dedup → one-vote verify.

---

## Findings

### 1. Wrong path revealed when viewer and folder selection both active (HIGH)

**File:** `electron/main.ts:623`

`enabled` uses `!!currentSelectionPath || !!currentExportImageContext?.sourcePath` — folder path first. The `click` handler uses the opposite order: `currentExportImageContext?.sourcePath || currentSelectionPath` — viewer path first. When a folder is selected in the sidebar *and* an image is open in the viewer, clicking "Reveal in Explorer" reveals the viewer image file rather than the selected folder, contradicting the ordering implied by `enabled`.

**Fix:** reverse the operand order in the click handler to `currentSelectionPath || currentExportImageContext?.sourcePath`, or explicitly document that viewer context takes precedence and rename the menu label accordingly.

---

### 2. IPC errors silently swallowed by `void setSelectionPath(...)` (MEDIUM)

**File:** `src/AppContent.tsx:211,225,227`

All three call sites use `void bridge.setSelectionPath(...)` with no `.catch()`. If the IPC call rejects (main process not ready, `rebuildApplicationMenu` throws, renderer out of sync), the error is dropped, `currentSelectionPath` in main is never updated, and the "Reveal in Explorer" item is permanently wrong for that session with no log or user feedback.

**Fix:** add `.catch((err) => console.error('set-selection-path failed', err))` or surface the error via the app's existing debug logger.

---

### 3. Startup race: persisted folder selection fires before `folders` loads (MEDIUM)

**File:** `src/AppContent.tsx:209`

On launch, `selectedFolderId` is restored from `galleryBrowserPersistence` before the `folders` tree is fetched from the DB. The `useEffect` (deps: `[selectedFolderId, folders]`) fires immediately with `folders = []`; `findFolder` returns `undefined`; `setSelectionPath(null)` is sent, disabling the menu item. The effect re-fires correctly once `folders` loads, but if the component unmounts or the IPC call from the first fire lands after the corrective one, the menu can be stuck in the null state.

**Fix:** guard the effect body with `if (!folders.length) return;` so it defers until the folder tree is populated, or use a ref to cancel the in-flight null-set when the corrective call is queued.

---

### 4. Renderer-supplied path passed to `shell.showItemInFolder` without absolute-path guard (LOW)

**File:** `electron/main.ts:2297`

`app:set-selection-path` stores the renderer-supplied `filePath` directly in `currentSelectionPath` with no `path.isAbsolute()` check or traversal sanitisation before it reaches `shell.showItemInFolder`. Other handlers (media protocol, `fs:read-image-metadata`) validate `path.isAbsolute()` before acting on renderer paths. With `contextIsolation: true` the practical risk is low, but a renderer XSS or compromised dependency could open arbitrary filesystem locations in the system file manager.

**Fix:**
```ts
if (filePath !== null && !path.isAbsolute(filePath)) return false;
currentSelectionPath = filePath;
```

---

### 5. TOCTOU: menu item appears enabled but click silently no-ops (LOW)

**File:** `electron/main.ts:621`

The menu is built with `enabled` computed from state at build time. If a folder-deselect IPC (`setSelectionPath(null)`) fires after the user opens the native menu but before they click, the already-displayed menu item still shows as enabled. The click handler's `if (pathToReveal)` guard prevents a crash but produces no visible feedback — the user clicks an apparently enabled item and nothing happens.

This is an inherent limitation of Electron's native menu lifecycle; the `if (pathToReveal)` guard is the correct defensive pattern. Worth noting for future menu-state work.

---

## Orphaned IPC handler (informational)

`api:get-culling-analytics` IPC handler and its preload wrapper (`getCullingAnalytics`) remain registered in `electron/main.ts` and `electron/preload.ts` after `CullingInsightsPanel` was deleted. No renderer code calls them. They are dead surface and should be removed in a follow-up chore to keep the IPC surface minimal.

---

## Not a bug: `export:set-current-image-context` triggers menu rebuild

Angle A initially suspected `currentExportImageContext` changes might leave `enabled` stale. Verified: the `export:set-current-image-context` handler (line 2291) calls `rebuildApplicationMenu()` on every update, so the menu is always current when the viewer opens or closes an image.
