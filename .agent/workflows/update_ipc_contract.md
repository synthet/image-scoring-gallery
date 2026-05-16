---
description: Update IPC contract — main, preload, renderer types
---

## Purpose

Add or change **Electron IPC** safely: main handler, preload bridge, TypeScript surfaces.

## When to use

- New `ipcMain.handle`, new `contextBridge` method, or payload shape change.

## Canonical docs first

- [docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md)
- `electron/main.ts`, `electron/preload.ts`, `src/electron.d.ts`

## Safe order

1. Implement handler in `electron/main.ts`.
2. Expose in `electron/preload.ts` with explicit API shape.
3. Update `src/electron.d.ts` and any wrapper hooks.
4. Add tests if IPC contracts are test-covered.
5. If payload crosses REST/schema boundaries, follow [cross_repo_contract_change.md](cross_repo_contract_change.md).

## Do not

- Do not expose raw `ipcRenderer` wide-open to the renderer.
- Do not add DB queries directly from React components.
