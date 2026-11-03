---
type: "Guide"
title: "End-to-end (Electron) testing"
description: "Playwright e2e suite for the built Electron app: how to run it, the hermetic harness, the fake backend, stubbing dialogs and menus, budgets, known defects, and how to add a journey."
resource: "docs/guides/06-e2e-testing.md"
tags: ["gallery-docs", "guides", "testing", "e2e"]
timestamp: 2026-11-02T00:00:00Z
okf_version: 0.1
---

# End-to-end (Electron) testing

The e2e suite drives the **built** app (compiled main process plus the Vite production bundle) through Playwright's `_electron`. Unit and component tests stay in Vitest; see [03 - Testing and Coverage](03-testing-and-coverage.md).

## Run it

```bash
npm run test:e2e                          # builds main + renderer, then runs every journey
npx playwright test layout                 # one spec, against the last build
npx playwright test -g "Escape closes it"  # one test by name
npx playwright test --debug                # step through with the inspector
npx playwright show-trace test-results/e2e/<test>/trace.zip   # after a failure
npx playwright test security --update-snapshots                # after a reviewed preload API change
```

Rebuild (`npx tsc -p electron/tsconfig.json && npx vite build`, or just `npm run test:e2e`) after changing app code; `npx playwright test` alone runs the existing build.

- One worker; Electron can't run headless, so each test opens a real window. These windows don't take focus and most live only a few seconds.
- 35 tests, about 2 minutes including the build on the reference Windows machine. Retries: none locally, 1 in CI.
- On failure, Playwright keeps the trace, and the fixture attaches a window screenshot and the main-process log.

## The harness

Everything lives in `tests/e2e/`.

| File | What it does |
|---|---|
| `harness.ts` | `makeEnv()` creates a temp root holding `userData`, a generated config, a `photos/` folder and a fake backend. `launch()` starts the built app in it. Also has menu, dialog and folder-mode helpers. |
| `fixture.ts` | `test` with `env`, `launchApp` and an `allowErrors` option. Every app launched in a test is closed afterwards. A page error, console error or main-process crash fails the test unless it matches `allowErrors`. |
| `fakeBackend.ts` | Stand-in for the image-scoring backend (below). |
| `fixtures.ts` | Generated photos. `generateJpegs(dir, n)` stamps an EXIF capture time on each file. `copyJpegs(dir, n)` skips EXIF and is fast enough for thousands. No binary fixtures are committed. |

The app sees the harness through three environment variables, read only in `electron/e2eHooks.ts`:

| Variable | Effect |
|---|---|
| `GALLERY_E2E=1` | Enables the other two. Without it they are ignored. |
| `GALLERY_USER_DATA` | `app.setPath('userData', …)`: a fresh profile per test, never the developer's. |
| `GALLERY_CONFIG` | Every config read and write (startup, Settings › Save, backup, folder metadata) goes to this file, not the repo `config.json`. |

The harness also sets `ELECTRON_IS_DEV=0`. `electron-is-dev` treats any unpackaged launch as development and would load the Vite dev server instead of the build.

**Why the hooks are safe in a packaged build.** They do nothing unless `GALLERY_E2E` is exactly `1` in the process environment, and the app never sets it. When it is set, the hooks only point `userData` and the config path elsewhere and skip starting the live MCP server. They don't relax any check, expose any IPC or load any code. `electron/e2eHooks.test.ts` covers the off state.

## The fake backend

`startFakeBackend()` answers only what the app needs, on a random local port:

- `GET /api/health` returns `{status: "ok"}`, so the backend counts as connected.
- `POST /api/db/query` is the `api` database engine's SQL endpoint, which returns `{rows}`. By default every query gets `rows: []`. `backend.onSql((sql, params) => rows | undefined)` adds an answer, and later handlers win. A handler that **throws** produces HTTP 500, which simulates a database failure for that query.
- `/ws/updates` accepts the live-updates WebSocket and stays silent.
- Everything else gets a 404, which the app treats as "backend feature unavailable".

Each request is recorded in `backend.requests`. The generated config points both the database engine and the API at the fake. Only the scoring window URL comes from the sibling `webui.lock`, and it is opened, never used.

## Stubbing dialogs and menus

- **Native dialogs:** `stubOpenDialog(app, [path])` replaces `dialog.showOpenDialog` in the main process, so the next folder picker returns `path`. Pass `[]` to simulate Cancel.
- **Menus:**
  - `clickMenu(app, ['View', 'Mode: Folder'])` calls the real `MenuItem.click()`, which also flips checkbox and radio items.
  - `menuItemState(app, labels)` reads `enabled`/`checked`. Poll it when an item depends on async state; for example, Tools › Scoring… is enabled only after the backend health check.
- **Folder mode:** `setFolderModeRoot(launched, env)` sets the root to `env.photos`. `openFolderGrid(launched, env)` also opens the `2026-01-19` folder that `generateJpegs` fixtures use.
- **Main process:** `app.evaluate(({ BrowserWindow, shell }) => …)` inspects or stubs it, as the security journey does to capture `shell.openExternal` calls.

## Journeys

Every test with its exact assertions and status: [07 - UX/UI test catalog](07-e2e-test-catalog.md).

| # | Spec | What it proves |
|---|---|---|
| — | `smoke.spec.ts` | A fresh profile starts, connects to the fake backend, uses the hermetic profile and config, and closes cleanly. |
| 1 | `startup.spec.ts` | Empty gallery with the backend connected; folder mode through the stubbed dialog shows generated photos; Tools › Scoring opens a second window. |
| 2 | `persistence.spec.ts` | A View toggle survives a relaunch on the same profile. |
| 3 | `lifecycle.spec.ts` | Closing the main window quits with no leftover process or main-process error. |
| 4 | `security.spec.ts` | No Node.js in the page; the preload API matches a reviewed snapshot; malformed IPC arguments are rejected; `window.open` and navigation away from the app are blocked; `media://` serves image files only; only backend links reach the operating system. |
| 5 | `accessibility.spec.ts` | axe-core WCAG 2.1 A/AA on the empty gallery, root-folder dialog, folder grid and viewer, with no violations; the viewer close button has a name; Escape closes the viewer. |
| 6 | `layout.spec.ts` | Library view at 1024×640, 800×600 and 640×480: no horizontal overflow, header controls not covered, the drawer collapses and opens. 150% scaling at 1280×720. |
| 7 | `large-data.spec.ts` | 3,000 photos in folder mode: first thumbnail within budget, a bounded DOM at the top, middle and end, the last photo reachable by scrolling and by keyboard (arrows, End across 38 pages, Home, Enter opens the photo). |
| 8 | `long-operations.spec.ts` | File › Import: one progress event per photo, each photo recorded once, a failed photo reported while the rest completes, and a cancel that keeps exactly the photos imported so far. |

Notes:
- axe runs in its **legacy (in-page) mode**, `AxeBuilder.setLegacyMode(true)`. The default mode opens a helper page, which Electron does not support.
- Journey 7 scrolls with the **mouse wheel**. Setting `scrollTop` directly is not equivalent: once the grid sits at the bottom, no more scroll events reach folder mode's paging trigger, so it stalls at 160 photos.
- Journey 8 covers **import** only. Sync reads only Nikon `.nef` files, and backup selects photos by score from the database. Neither can run on generated fixtures without faking camera files or backend query results, so both are untested end to end.

### Budgets (journey 7)

Measured on the reference Windows machine with the built app. The budgets leave room for a busy machine but still catch a lost virtualization or a blocking load.

| Measure | Measured | Budget |
|---|---|---|
| First visible thumbnail after opening a 3,000-photo folder | 190–930 ms (2.6 s once on a heavily loaded machine) | 4,000 ms |
| Cards rendered at the top, middle and end of the grid | 40 | 120 |
| Scrolling to the last of 3,000 photos (38 pages of 80) | about 20 s | 60 s timeout; recorded as a test annotation, not a budget |

The measured times are attached to each run as test annotations (`first-thumbnail-ms`, `scroll-to-end-ms`).

## Known defects (`test.fail`)

A test for a known defect is marked `test.fail(true, '#<issue>: …')`. It passes while the defect exists. Once the fix lands, the test starts "unexpectedly passing" and Playwright fails it; remove the `test.fail` line at that point.

| Issue | Tests |
|---|---|
| [#239](https://github.com/synthet/image-scoring-gallery/issues/239) | The grid has no multi-selection or select-all yet (waits for a decision on bulk actions). |

The IPC contract test (`electron/ipcRegistry.test.ts`, Vitest) is strict: every wrapped handler's envelope must be unwrapped by the preload. Its two former defects were fixed in [#222](https://github.com/synthet/image-scoring-gallery/issues/222).

## Flakiness

- **`[WebSocket] Error` in the page.** This came from a product bug, fixed in [#230](https://github.com/synthet/image-scoring-gallery/issues/230). Closing a socket that was still connecting let its error event close the new connection. It hit 3 of 12 accessibility tests before the fix and 0 of 24 after. If it comes back, look at `src/services/WebSocketService.ts` and don't add it to `allowErrors`.
- **Snapshot line endings.** With `core.autocrlf=true`, a Windows checkout would turn the committed LF snapshot into CRLF and fail the preload API test. `.gitattributes` marks `tests/e2e/**/*-snapshots/**` as `-text`, so snapshots stay byte for byte as committed.
- **Timing budgets on a shared machine.** Other sessions' test runs can slow the first thumbnail several-fold (2.6 s once, against a usual 190–930 ms). The budget allows for that.

## Adding a journey

1. Create `tests/e2e/<name>.spec.ts`. Import `test` and `expect` from `./fixture`, not from `@playwright/test`.
2. Generate photos in `env.photos` with `generateJpegs` or `copyJpegs`. Add backend answers with `env.backend.onSql(...)` before `launchApp()`.
3. Drive the UI through roles and visible text (`getByRole`, `getByText`, `getByTitle`), not CSS-module class names, which are hashed in the build.
4. Name the test after the user outcome it proves. Keep one journey per spec.
5. **Prove it can fail:** break the code path it covers, rebuild, watch the test fail, then restore the code and check that `git diff` is clean.
6. If it finds a defect, file an issue, mark the test `test.fail(true, '#N: …')`, and add a row above. Don't fix the product in the same change.

[← Back to Guides](README.md)
