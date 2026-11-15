---
name: electron-dev
description: Development workflow, build commands, and IPC patterns for the Electron+React+Vite image gallery application.
---

# Electron Development Workflow

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev mode (Vite HMR + Electron) |
| `npm run build` | Production build + electron-builder |
| `npm run lint` | ESLint checks |
| `./run-debug.bat` | Shortcut launcher for dev mode |

## Architecture

```
Main Process (Node.js)          Renderer Process (Chromium)
┌─────────────────────┐         ┌──────────────────────────┐
│ electron/main.ts    │◄─IPC──►│ src/main.tsx             │
│ electron/db.ts      │         │ src/App.tsx              │
│ electron/preload.ts │         │ src/components/...       │
│ electron/nefExtractor.ts│     │ src/hooks/...            │
└─────────────────────┘         └──────────────────────────┘
```

- **Main Process** (`electron/`): DB operations, file system, OS integration
- **Renderer Process** (`src/`): React UI, hooks, state
- **Bridge**: `contextBridge` in `preload.ts` exposes `window.electron` API

## Adding a New IPC Handler (Step-by-Step)

This is the most common task. Follow these steps in order:

### Step 1: Database function in `electron/db.ts`

```typescript
export async function getMyData(options: MyOptions = {}): Promise<MyResult[]> {
    return query<MyResult>('SELECT ... FROM ... WHERE ...', []);
}
```

### Step 2: IPC handler in `electron/ipc/register*Handlers.ts`

Handlers live in the `register*Handlers.ts` module for their area (DB channels: `registerDbHandlers.ts`),
wrapped by `wrapIpcHandler` so errors reach the renderer as an envelope. Validate arguments:

```typescript
ipcMain.handle('db:my-channel', wrapIpcHandler(async (_, options: unknown) => {
    return await db.getMyData(parseOptions(options));
}));
```

### Step 3: Expose in `electron/preload.ts`

```typescript
getMyData: (options?: any) => ipcRenderer.invoke('db:my-channel', options),
```

### Step 4: Declare types in `src/electron.d.ts`

Add to the `Window.electron` interface:

```typescript
getMyData: (options?: { limit?: number; offset?: number }) => Promise<any[]>;
```

### Step 5: Add `src/bridge.ts` stubs

`bridge.ts` implements the same interface for browser (web) mode and folder mode. Add a method to both
stub objects (usually a resolved empty/unavailable value), or `npm run typecheck` fails.

### Step 6: Catalog the channel for the driftara MCP

CI fails on any `ipcMain.handle` channel without a reviewed tier. Local `npm test` does not run this check.

```bash
# add "db:my-channel": { "tier": "read" } (read | write | destructive) to mcp-server/driftara/overrides.json
cd mcp-server
node scripts/build_driftara_catalog.mjs              # regenerate driftara/catalog.json
node scripts/build_driftara_catalog.mjs --update-doc # regenerate the docs/technical/DRIFTARA_MCP.md block
npm run check:driftara-catalog && npm run test:unit
```

### Step 7: Use in React

```typescript
const data = await window.electron.getMyData({ limit: 50 });
```

## Key Patterns

### Media Protocol
Images are served via a custom `media://` protocol registered in `main.ts`. To display an image:
```typescript
const src = `media://${image.thumbnail_path || image.file_path}`;
```

### WSL Path Conversion
The DB stores WSL-style paths (`/mnt/d/...`). The `convertPathToLocal()` function in `main.ts` converts them to Windows paths (`D:/...`). Any new path handling must account for this.

### Config Loading
`config.json` at project root provides DB credentials and dev server URL. Both `main.ts` and `db.ts` load it independently via `loadConfig()`.

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | 40.x | Desktop runtime |
| `react` | 19.x | UI framework |
| `vite` | 7.x | Build tool + HMR |
| `typescript` | 5.9 | Type safety |
| `pg` | 8.x | PostgreSQL DB client |
| `zustand` | 5.x | State management |
| `react-virtuoso` | 4.x | Virtualized grid |
| `exiftool-vendored` | 35.x | EXIF/RAW metadata |
| `libraw-wasm` | 1.x | Client-side RAW decode |
| `lucide-react` | 0.5x | Icons |

## Troubleshooting

1. **App won't start**: Check PostgreSQL is running (Docker container on `localhost:5432`)
2. **Blank gallery**: Check Electron main process console for DB errors
3. **Images not loading**: Verify `media://` protocol and WSL path conversion
4. **Type errors**: Run `npm run lint` — check `electron.d.ts` matches `preload.ts`
5. **Verifying a production build**: an unpackaged `electron .` counts as dev (`electron-is-dev`) and loads
   the Vite URL. Run `npm run build:app`, then `ELECTRON_IS_DEV=0 npx electron . --remote-debugging-port=<port>`
   to load `dist/` through `loadFile`.
6. **CDP screenshot times out**: an occluded window may stop painting, so `Page.captureScreenshot` hangs.
   Assert on the DOM instead: `playwright-core` `chromium.connectOverCDP('http://127.0.0.1:<port>')`, then
   `page.evaluate(...)` / `waitForSelector`.
