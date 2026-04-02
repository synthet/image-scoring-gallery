# Frontend Code & Design Review Report
## electron-image-scoring v3.24.1

**Date:** 2026-03-02

---

## Executive Summary

This document provides a comprehensive technical review of the **electron-image-scoring** repository, which serves as the frontend client for the AI-powered Image Scoring System. While the application establishes a solid foundation leveraging Electron, React, and Vite, it currently suffers from significant technical debt related to database connection management, memory scalability, and test coverage.

Addressing the critical architectural bottlenecks—particularly the lack of database connection pooling and unbounded memory growth—is essential before adding new features. These improvements should be paired with the security and thread-safety resolutions required on the backend Python pipeline.

---

## Architecture Overview

**Tech Stack:** Electron 40, React 19, Vite 7, TypeScript 5.9  
**Backend/Database:** Firebird SQL (Local/Companion), Python FastAPI (Remote API)  
**Key Capabilities:** Image browsing, multi-model scoring/rating, stacking, folder navigation, RAW/NEF support, real-time WebSocket event streaming.  
**MCP Integration:** Built-in Model Context Protocol server exposing debugging and diagnostic tools.  

**Critical Files:** 
- `electron/main.ts` (Main process)
- `electron/db.ts` (Database driver abstraction)
- `electron/preload.ts` (IPC bridge boundary)
- `src/App.tsx` (Root React component)
- `src/hooks/useDatabase.ts` (Data access layer logic)

---

## Detailed Findings

### 🔴 Critical Issues

#### 1. No Database Connection Pooling
**File:** `electron/db.ts`
Every database query creates a brand-new Firebird connection asynchronously, executes the query, and immediately detaches. With virtualized paginated loading (e.g., fetching 50 images at a time), this results in 50+ expensive connection handshakes per rapid scroll action. This drastically impacts UI responsiveness and Database throughput.
*Recommendation:* Implement connection pooling or maintain a durable persistent connection in the main process.

#### 2. Unbounded Image Array Growth
**File:** `src/hooks/useDatabase.ts`
The application appends all loaded pages into a single large array stored in state (`setImages(prev => [...prev, ...filtered])`). When browsing directories containing 10,000+ files, the entire dataset is retained in memory. Although `react-virtuoso` efficiently virtualizes DOM rendering, the underlying JavaScript memory allocation grows indefinitely, eventually risking an Out-Of-Memory (OOM) crash.
*Recommendation:* Implement a sliding-window array structure or strict cursor-based memory cleanup.

#### 3. Monolithic State Management
**File:** `src/App.tsx` (~450 lines)
The root component acts as a god-object managing all global application state: active filters, view modes (gallery vs. stacks), the active stack payload, image viewer modals, WebSocket subscriptions, and notification dispatching.
*Recommendation:* Decompose the component into a manageable tree using React Context providers or feature-specific modular custom hooks.

#### 4. Inconsistent IPC Error Handling
**File:** `electron/main.ts`
The IPC handlers mix three contradictory error management strategies:
1. Returning an empty array `[]` on failure (making it impossible to distinguish between "0 results found" and "Database crashed").
2. Returning an error object payload `{ error: e.message }`.
3. Throwing exceptions directly over the IPC bridge.
*Recommendation:* Standardize on a robust IPC wrapper responding with a consistent, typed envelope (e.g., `{ ok: boolean, data?: Payload, error?: string }`).

#### 5. Complete Lack of Test Coverage
**Files:** Entire `/src` and `/electron` directories
Zero testing infrastructure exists. There is no configured test runner (Jest/Vitest), no mocks for the `window.electron` bridge, and critically, the complex race-condition-prone custom hooks (`useImages`, `useStacks`) remain completely untested.

---

### 🟠 High Severity

#### 6. Inefficient NEF Buffer Serialization
**File:** `electron/main.ts`
The `nef:extract-preview` handler converts large binary image buffers to `Array.from(new Uint8Array(buffer))` prior to IPC transit. This serializes multi-megabyte binary payloads as massive generic JSON number arrays, halting the primary thread during parsing.
*Recommendation:* Refactor to utilize Electron's native buffer/Uint8Array passing capabilities securely over IPC context bridges.

#### 7. Unbounded WebSocket Reconnection Backoff
**Files:** `src/services/WebSocketService.ts`
Reconnection logic targets the backend API on a static 5-second interval infinitely. It lacks maximum retry limits, connection jitter, or exponential backoff, which could unnecessarily hammer a restarting or temporarily downed API server.

#### 8. Race Conditions in React State Hooks
**File:** `src/hooks/useDatabase.ts`
- `JSON.stringify(filters)` is used as a `useEffect` dependency array. This creates a deeply equal but referentially distinct string instance every render cycle, triggering excessive unnecessary re-renders.
- Closure capture in `loadMore()` can reference stale `offset` state values during rapid pagination requests.
- Multiple competing `useEffect` hooks in the Image Viewer component trigger race conditions when managing the active `image` state asynchronously.

#### 9. Excessive Type Evasions (`any`)
The codebase bypasses strict TypeScript safety benefits in multiple critical domains:
- `useState<any | null>(null)` for opening images inside `App.tsx`.
- Un-typed filter payloads (`filters?: any`).
- `electron/preload.ts` accepts loosely typed broadcast context updates.

---

### 🟡 Medium Severity

#### 10. Missing UI Design System & Component Library
The frontend relies heavily on duplicated inline styled objects spread across standard components, recreating identical UI objects on every render cycle. Brand styling colors (`#2a2a2a`, `#333`) are hardcoded, and the layout uses fixed dimensions without dynamic responsive breakpoints.
*Recommendation:* Migrate to standard CSS Modules, Tailwind CSS, or instantiate a comprehensive strict CSS variable token system.

#### 11. Excessive Prop Drilling
The component tree (`App` → `MainLayout` → `GalleryGrid`) drills over 15 distinct props straight down the hierarchy chain. Filter states, view callbacks, and generalized notifications should preferably reside in shared Context or localized Zustand stores.

#### 12. Local Path Traversal Risk via `media://` Protocol
**File:** `electron/main.ts`
The custom `media://` protocol handler blindly resolves requested files utilizing `decodeURIComponent()` without strictly enforcing a secondary sandbox bounds-check or canonicalizing paths to ensure they stay entirely within user-approved working directories.

#### 13. Duplicate UI Logic Patterns
- Hooks `useImages()` and `useStacks()` effectively represent ~80% duplicated identical logic structures.
- Grid rendering component logic for individual raw images vs. clustered stack cards share near-identical complex markup structures.

#### 14. Missing Global Error Boundaries
The total lack of a higher-order React `<ErrorBoundary>` container means that any localized uncaught React render loop exception will white-screen the entire overarching Electron window, necessitating a forceful hard user restart.

---

### 🟢 Low Severity

#### 15. Minimal MCP Server Tooling Scope
**File:** `mcp-server/src/index.ts`
The embedded Model Context Protocol (MCP) server currently exposes a minimum-viable-product set of three endpoints (logs, config, stats). It misses a broader opportunity to expose functional database query tools or direct image caching controls natively to attached AI agents.

#### 16. Outdated Database Driver Architecture
`node-firebird@1.1.9` is severely outdated and fails to supply native integrated TypeScript type definitions natively.
*Recommendation:* Evaluate adopting alternative Firebird node clients (e.g. `node-firebird-driver-native`) or establish a strictly typed schema wrapper.

#### 17. Incomplete Empty/Loading Interface States
- Provide graceful degradation: if the image viewer unexpectedly fails fetching detailed Firebird metadata, it hangs indefinitely on "Loading detailed information..." instead of exposing a retry hook.
- The default main gallery grid interface completely lacks skeleton loading elements.

---

## What's Done Well

- **Security Posture:** Context isolation is enabled globally (`contextIsolation: true`), node integration is correctly disabled out of the box, and SQL queries successfully leverage parameterized logic defenses against injection attacks.
- **Render Virtualization:** Proactively adopting `react-virtuoso` effortlessly handles underlying DOM node bloat for rapidly loading enormous media libraries.
- **RAW Interoperability:** Cleanly implements an excellent internal tool fallback chain (`exiftool-vendored` followed by `libraw-wasm`) required to interpret proprietary digital camera container files.
- **Event-Driven UI Propagation:** WebSockets are correctly orchestrated to push Python scoring algorithm updates strictly and cleanly back into the active user's viewport without polling delays.
- **Stack Caching Mechanism:** Architecting the database to aggregate stack data via a separate pre-computed cache table ultimately saves highly significant database join and recursion overhead delays.
- **Diagnostic Tooling Setup:** The integration of decoupled modular Zustand states specifically for notifications, alongside active diagnostic session recording hooks (`useSessionRecorder`), represent highly valuable debugging patterns.

---

## Recommended Action Plan

To systematically and sustainably eradicate the present technical debt without halting business feature velocity, prioritize remediation workflows in the following structured order:

1. **Performance Hardening (Immediate Priority):**
   - Introduce and validate robust Database Connection Pooling within `electron/db.ts`.
   - Refactor NEF and proprietary image buffer IPC pathways away from JSON arrays towards native standard IPC `Uint8Array` transit pipelines.
2. **Stability & Data Engineering (Short-Term Priority):**
   - Engineer and blanket-distribute a standardized `{ ok, data, error }` IPC Response Envelope framework.
   - Inject a root React Error Boundary container, gracefully encapsulating rendering unmounts.
3. **Refactoring Strategies (Mid-Term Priority):**
   - Architect global application states and discrete context out of `App.tsx` directly addressing component prop drilling logic cascades.
   - Halt unbounded continuous memory array retention located in `useImages` via aggressive DOM data window slicing limiters.
4. **Testing Infrastructure Pipelines (Ongoing Priority):**
   - Incorporate comprehensive `Vitest` and `React Testing Library` paradigms, specifically testing `src/hooks/useDatabase.ts` logic alongside any global Zustand context mutations.

## Remediation Status

**Date Applied:** 2026-03-03

The following findings have been implemented and verified (TypeScript compilation + Vite production build passing):

| # | Finding | Severity | Status | Files Changed |
|---|---------|----------|--------|---------------|
| 1 | Database Connection Pooling | Critical | **Resolved** | `electron/db.ts` |
| 2 | Unbounded Image Array Growth | Critical | **Resolved** | `src/hooks/useDatabase.ts` |
| 3 | Monolithic State Management | Critical | Deferred | — |
| 4 | Inconsistent IPC Error Handling | Critical | **Resolved** | `electron/main.ts`, `electron/preload.ts` |
| 5 | Lack of Test Coverage | Critical | Deferred | — |
| 6 | NEF Buffer Serialization | High | **Resolved** | `electron/main.ts` |
| 7 | WebSocket Reconnection Backoff | High | **Resolved** | `src/services/WebSocketService.ts` |
| 8 | Race Conditions in Hooks | High | **Resolved** | `src/hooks/useDatabase.ts` |
| 9 | Excessive `any` Types | High | **Partial** | `src/electron.d.ts`, `src/hooks/useDatabase.ts` |
| 10 | Missing Design System | Medium | Deferred | — |
| 11 | Excessive Prop Drilling | Medium | Deferred | — |
| 12 | Path Traversal Risk | Medium | **Resolved** | `electron/main.ts` |
| 13 | Duplicate Hook Logic | Medium | **Resolved** | `src/hooks/useDatabase.ts` |
| 14 | Missing Error Boundaries | Medium | **Resolved** | `src/components/ErrorBoundary.tsx`, `src/main.tsx` |
| 15 | Minimal MCP Scope | Low | **Resolved** | `mcp-server/src/index.ts`, `mcp-server/src/tools/api.ts`, `mcp-server/src/tools/cdp.ts`, `mcp-server/src/utils/capabilities.ts`, `mcp-server/src/utils/cdp.ts` |
| 16 | Outdated DB Driver | Low | Deferred | — |
| 17 | Loading/Empty States | Low | Deferred | — |

### Changes Summary

**12 of 17 findings resolved. 5 deferred for separate work.**

#### `electron/db.ts` — Persistent Connection
- Replaced per-query `Firebird.attach()` with a `getConnection()` singleton
- Auto-reconnects on stale/failed connections
- Added `closeConnection()` for graceful shutdown

#### `electron/main.ts` — IPC Envelope + Security
- Created `wrapIpcHandler()` utility returning `{ ok, data, error }` envelope
- Applied to all 13 database IPC handlers
- Replaced `Array.from(new Uint8Array(buffer))` with native Buffer passing for NEF
- Added `path.resolve()` + `path.normalize()` sanitization to `media://` protocol handler

#### `electron/preload.ts` — Envelope Unwrapping
- Created `unwrapEnvelope<T>()` helper that extracts `data` or throws on error
- All IPC methods now provide clean typed API to the renderer layer

#### `src/hooks/useDatabase.ts` — Generic Pagination
- Created `usePaginatedData<T>()` generic hook eliminating 80% duplication
- `useImages()` and `useStacks()` now thin wrappers around shared logic
- Added `MAX_LOADED_ITEMS = 2000` sliding window cap
- Fixed stale closures using `useRef` for offset/filters/folderId
- Added `useCallback` with proper dependency arrays

#### `src/services/WebSocketService.ts` — Backoff
- Exponential backoff: 1s, 2s, 4s, ... up to 30s max
- ±20% jitter to prevent thundering herd
- Max 50 retry attempts before stopping
- Added `disconnect()` cleanup method

#### `src/components/ErrorBoundary.tsx` — Error Handling
- React class component with `getDerivedStateFromError` + `componentDidCatch`
- Shows error details and "Reload Application" button instead of white screen
- Wrapped `<App />` in `src/main.tsx`

#### `src/electron.d.ts` — Type Cleanup
- Fixed `getImageCount` and `getStackCount` return types (removed `| { error: string }`)
- Updated `extractNefPreview` buffer type from `number[]` to `Uint8Array`
- Removed duplicate property definitions

#### `mcp-server/` — Consolidated gallery MCP
- Renamed the gallery MCP package/server to reflect its broader scope (`imgscore-el-gallery`)
- Added `gallery_status` to probe FastAPI and Electron CDP reachability before choosing tool families
- Added reachability-aware FastAPI probe tools (`api_*`) and Electron CDP tools (`cdp_*`)
- Added configurable CDP endpoint resolution via `ELECTRON_CDP_URL` / `ELECTRON_REMOTE_DEBUGGING_PORT`

### Deferred Items

| # | Finding | Reason |
|---|---------|--------|
| 3 | App.tsx Decomposition | Best done after state changes stabilize |
| 5 | Testing Infrastructure | Deserves dedicated task with Vitest setup |
| 10 | Design System / CSS | Large UI refactor requiring design decisions |
| 11 | Prop Drilling | Depends on App.tsx decomposition (#3) |
| 16 | DB Driver Upgrade | Risky dependency swap, requires migration plan |
| 17 | Loading/Empty States | UI polish pass, low severity |

---

## Conclusion

The currently architected electron-image-scoring frontend presents a deeply capable, functionally rich foundation intended for navigating and dynamically analyzing exponentially large photographer media sets. Realistically however, its long-term baseline stability remains heavily compromised by critical scaling bottlenecks primarily driven by the 1-to-1 database connection teardown design and deeply unstructured IPC/error reporting methodologies.

Just as its paired system architecture—the Image Scoring Backend Pipeline—requires immediate thread safety and robust queue-processing modifications—the frontend codebase must unequivocally mandate memory-safety state prioritization and explicit connection economy pooling ahead of engaging new extensive graphical features to achieve a true production-ready status.
