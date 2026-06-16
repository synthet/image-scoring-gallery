---
type: "Report"
title: "Code Review + Design Review (2026-02-09)"
description: "Reviewed:"
resource: "docs/reports/02-code-review-2026-02.md"
tags: ["gallery-docs", "reports"]
timestamp: 2026-06-16T00:00:00Z
---

# Code Review + Design Review (2026-02-09)

## Scope and Method
Reviewed:
- `electron/main.ts`
- `electron/db.ts`
- `electron/preload.ts`
- `src/hooks/useDatabase.ts`
- `src/App.tsx`

Validation run in this environment:
- `npm run lint`
- `npm run build`

---

## Executive Summary
The app has a good baseline (Electron hardening defaults are present, data access is centralized, and gallery pagination exists), but there are still several production risks:

| Priority | Area | Risk |
|---|---|---|
| P1 | Custom protocol (`media://`) | Potential local-file exposure due to permissive path handling + CSP bypass |
| P2 | Pagination / IPC concurrency | Overlapping requests can produce stale/duplicated list state |
| P2 | Logging | Unbounded log growth in user-data directory |
| P3 | Type safety | Heavy `any` usage across IPC boundary and hooks increases runtime error risk |
| P3 | Render efficiency | Repeated folder-tree traversals in `App.tsx` can become expensive at scale |

---

## Detailed Findings

### 1) `media://` protocol is overly permissive (**P1 / High**)

### Evidence
- Protocol privileges include `bypassCSP: true`.
- Handler converts URL text directly to file path and performs `net.fetch('file:///' + filePath)`.
- No root allowlist, traversal rejection, or MIME restriction is enforced.

### Why this matters
If attacker-controlled content can influence image URLs in renderer context, the protocol can become a local file read primitive.

### Recommendation
1. Remove `bypassCSP` unless strictly required.
2. Canonicalize path with `path.resolve` and enforce allowlisted roots.
3. Reject non-existent, non-file, and traversal paths.
4. Return structured error responses and telemetry for blocked requests.

### Suggested implementation sketch
- Build `const allowedRoots = [...]` once at startup.
- For each request:
  - decode and normalize path
  - ensure `resolvedPath.startsWith(root)` for one root
  - serve only expected extensions/content types

---

### 2) `useImages` load flow can race under fast UI changes (**P2 / Medium**)

### Evidence
- `loadMore()` depends on closure state (`loading`, `offset`, `hasMore`).
- Reset effect clears state on filter/folder change.
- Another effect immediately calls `loadMore()` when offset resets to zero.
- Scroll-end callback can also invoke `loadMore()` concurrently.

### Why this matters
Out-of-order async responses can append stale pages after a filter change, causing duplicates or wrong data slices.

### Recommendation
1. Add request epoch/token (`useRef<number>`).
2. Capture token before each request; ignore responses for old token.
3. Use in-flight guard to prevent concurrent same-epoch calls.
4. Prefer stable filter keys (`useMemo`) over repeated `JSON.stringify(filters)` in deps.

---

### 3) Session logging needs retention/rotation (**P2 / Medium**)

### Evidence
- `debug:log` appends to `session_YYYY-MM-DD.log` indefinitely.
- No size cap, rotation, retention, or production verbosity control.

### Why this matters
Long sessions can bloat `%APPDATA%`/userData and eventually impact disk usage and startup diagnostics.

### Recommendation
1. Rotate at size threshold (e.g., 10 MB).
2. Keep last N files/days (e.g., 7 days).
3. Gate debug verbosity by environment/config flag.

---

### 4) Type boundaries are too loose (**P3 / Medium**)

### Evidence
- Lint output reports many `@typescript-eslint/no-explicit-any` violations across main/preload/renderer files.
- IPC request/response contracts are mostly untyped (`any` payloads/options).

### Why this matters
Schema drift or malformed records can survive compile-time checks and fail at runtime.

### Recommendation
1. Introduce shared contract types for IPC channels.
2. Replace `any` with explicit domain types (`ImageListItem`, `ImageDetails`, `FolderNode`, `KeywordListResponse`, etc.).
3. Type IPC handlers and preload bridge function signatures end-to-end.

---

### 5) Folder traversal logic is repeated in `App.tsx` (**P3 / Low-Medium**)

### Evidence
- Recursive lookup logic appears multiple times for:
  - current selected folder
  - parent navigation
  - subfolder derivation for grid

### Why this matters
For large trees, repeated recursive scans per render/event can add avoidable CPU cost and code duplication.

### Recommendation
1. Build indexed maps once in `useFolders`:
   - `byId`
   - `childrenById`
   - `parentById`
2. Consume these maps in `App.tsx` for O(1)/O(k) lookups.
3. Centralize folder-lookup helpers to reduce divergence bugs.

---

## Design Review Notes (Architecture)

### What is working well
- Good Electron defaults in BrowserWindow (`contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`).
- DB access is centralized in `electron/db.ts` rather than scattered SQL.
- Sorting column validation is present before SQL interpolation.

### Suggested medium-term architecture upgrades
1. **Typed IPC contract module** shared by `main`, `preload`, and renderer types.
2. **Query orchestration layer** in renderer for pagination, cancellation, and stale-response handling.
3. **Security hardening pass** for protocol/path handling and log sanitization.
4. **Observability policy** (log levels + retention) to keep diagnostics useful but bounded.

---

## Practical Remediation Plan

### Sprint 1 (highest impact)
- Harden `media://` path validation + remove CSP bypass.
- Add request token/in-flight guard to `useImages`.

### Sprint 2
- Add log rotation/retention.
- Introduce shared IPC types and convert high-traffic endpoints.

### Sprint 3
- Refactor folder lookup to indexed structure.
- Cleanup remaining lint/type warnings.

---

## Validation Output Summary
- `npm run lint`: **failed** because repository currently has existing lint violations (including widespread `no-explicit-any`).
- `npm run build`: frontend/electron compile path ran, but packaging failed in this environment when electron-builder attempted to download Electron binaries from GitHub (HTTP Forbidden).
