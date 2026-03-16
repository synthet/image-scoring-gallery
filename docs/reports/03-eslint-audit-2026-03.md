# ESLint Audit Report

**Date:** 2026-03-04  
**Total:** 460 problems (438 errors, 22 warnings)

## Critical Issue: Build Directories Being Linted

ESLint is scanning `release-builds/` and `release-builds-v2/`, which contain copies of source files. This duplicates every error 2–3×. Adding these to ESLint ignores will cut the error count roughly in half.

**Fix:** Add to `.eslintignore` or the ESLint config's `ignores` array:
```
release-builds/
release-builds-v2/
```

---

## Source-Level Errors (src/, electron/, mcp-server/)

### Error Summary

| Rule | Count | Severity | Description |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | ~380 | error | Using `any` type throughout the codebase |
| `react-hooks/set-state-in-effect` | 2 | error | Calling setState synchronously in effects |
| `react-hooks/preserve-manual-memoization` | 1 | error | `useCallback` dependency mismatch |
| `react-hooks/exhaustive-deps` | ~8 | warning | Missing hook dependencies |
| `@typescript-eslint/no-unused-vars` | 3 | error | Unused variables |
| `prefer-const` | 1 | error | `let` used where `const` suffices |
| `@typescript-eslint/no-require-imports` | 1 | error | `require()` used instead of `import` |
| `@typescript-eslint/ban-ts-comment` | 1 | error | `@ts-ignore` should be `@ts-expect-error` |
| `@typescript-eslint/no-empty-object-type` | 1 | error | Empty interface |

---

### Detailed Findings by File

#### `electron/db.ts`
- **Line 4:** `app` imported but never used
- **Line 160:** `err` defined but never used
- **Line 640:** Empty interface (no members)
- **Lines 243–1069:** ~20 uses of `any`

#### `electron/main.ts`
- **Line 207:** `let url` should be `const url`
- **Line 277:** `require()` import — use `import` instead
- **Lines 38–491:** ~10 uses of `any`

#### `electron/nefExtractor.ts`
- **Line 58:** 1 use of `any`

#### `electron/preload.ts`
- **Lines 21–93:** ~16 uses of `any`

#### `mcp-server/src/index.ts`
- **Lines 102–143:** 3 uses of `any`

#### `src/AppContent.tsx`
- **Line 125:** `_data` defined but never used
- **Line 160:** Missing `addNotification` in useEffect deps (warning)
- **Lines 28–211:** ~10 uses of `any`

#### `src/components/Duplicates/DuplicateFinder.tsx`
- **Lines 13–93:** 6 uses of `any`

#### `src/components/Gallery/GalleryGrid.tsx`
- **Line 288:** `_atBottom` defined but never used
- **Lines 49–64:** 2 uses of `any`

#### `src/components/Settings/SettingsModal.tsx`
- **Lines 11–57:** 4 uses of `any`

#### `src/components/Tree/treeUtils.ts`
- **Line 12:** 1 use of `any`

#### `src/components/Viewer/ImageViewer.tsx`
- **Line 316:** Missing `buildExportPayload` in useEffect deps (warning)

#### `src/electron.d.ts`
- **Lines 9–31:** ~10 uses of `any` in type declarations

#### `src/hooks/useDatabase.ts`
- **Line 56:** `connect()` called synchronously in effect — triggers cascading renders
- **Line 237:** `useCallback` memoization can't be preserved by React Compiler (dep is `result.removeItem`, compiler infers `result`)
- **Lines 165, 201, 239:** Missing hook dependencies (warnings)
- **Lines 46–258:** ~8 uses of `any`

#### `src/hooks/useFolders.ts`
- **Line 21:** `fetchFolders()` called synchronously in effect — triggers cascading renders
- **Line 5:** 1 use of `any`

#### `src/libraw-wasm.d.ts`
- **Line 5:** 1 use of `any`

#### `src/services/Logger.ts`
- **Lines 2–18:** 5 uses of `any`

#### `src/services/WebSocketService.ts`
- **Lines 3–129:** 3 uses of `any`

#### `src/utils/nefViewer.ts`
- **Line 14:** 1 use of `any`
- **Line 314:** Use `@ts-expect-error` instead of `@ts-ignore`

---

## Recommended Fix Priority

### 1. Exclude build directories (immediate — eliminates ~50% of reported errors)
Add `release-builds/` and `release-builds-v2/` to ESLint ignores.

### 2. Quick mechanical fixes (low risk)
- `prefer-const` on `main.ts:207` — change `let` to `const`
- `@ts-ignore` → `@ts-expect-error` on `nefViewer.ts:314`
- Prefix unused vars with `_` or remove: `app` in `db.ts`, `err` in `db.ts`, `_atBottom` in `GalleryGrid.tsx`
- Replace `require()` with `import` in `main.ts:277`
- Remove empty interface in `db.ts:640`

### 3. React hooks issues (medium risk)
- `useDatabase.ts:56` and `useFolders.ts:21` — refactor to avoid synchronous setState in effects
- `useDatabase.ts:237` — fix `useCallback` dependency to satisfy React Compiler
- Address missing dependency warnings in `useEffect`/`useCallback`

### 4. Type `any` elimination (large effort)
- ~380 instances across the codebase
- Requires defining proper interfaces/types for IPC messages, DB rows, API responses
- Recommend tackling file-by-file, starting with `electron.d.ts` (type declarations) and `preload.ts` (IPC bridge)
