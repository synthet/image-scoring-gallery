---
type: "Guide"
title: "UX/UI test catalog"
description: "Every end-to-end UX/UI test on the built Electron app: what it asserts, which defect it tracks, and its current status."
resource: "docs/guides/07-e2e-test-catalog.md"
tags: ["gallery-docs", "guides", "testing", "e2e", "accessibility"]
timestamp: 2026-11-02T00:00:00Z
okf_version: 0.1
---

# UX/UI test catalog

Every end-to-end test in `tests/e2e/`: what it checks, and whether it passes or tracks a known defect. For how to run the suite, the harness and how to add a test, see [06 - End-to-end (Electron) testing](06-e2e-testing.md).

**Status key.**
- **Pass:** the behavior is asserted and must hold.
- **Known defect #N:** the test is marked `test.fail(true, '#N: …')`. It passes while the defect exists and fails once the fix lands; remove the marker then.

Status is as of `main` on 2026-11-02, after [#231](https://github.com/synthet/image-scoring-gallery/pull/231) and [#232](https://github.com/synthet/image-scoring-gallery/pull/232): 34 tests, of which 33 pass and 1 tracks a known defect.
- #232 fixed the accessibility defects (#225), so the four axe scans are strict: any WCAG 2.1 A/AA violation fails.
- #231 fixed the WebSocket bug (#230) behind the suite's only flake.

## Smoke

| Test | Asserts | Status |
|---|---|---|
| a fresh profile starts, reaches the gallery shell, and closes cleanly | `body[data-app-state=gallery]`; no connection-error heading; `userData` is the test profile; the fake backend received `/api/db/query`; no page errors | Pass |

## Journey 1: startup and shell (`startup.spec.ts`)

| Test | Asserts | Status |
|---|---|---|
| a fresh profile shows the empty gallery with the backend connected | "Image Gallery" and "(0 items)" visible; no "Backend offline" chip | Pass |
| folder mode: picking a root folder through the dialog shows its photos | View › Mode: Folder → Root folder… → Browse (stubbed dialog) → Save; the dated folder lists its 3 generated photos | Pass |
| Tools › Scoring opens the scoring window on the local backend | the menu item becomes enabled after the health check; a second native window opens at `/ui/runs` | Pass |

## Journey 2: persistence (`persistence.spec.ts`)

| Test | Asserts | Status |
|---|---|---|
| a View toggle changed in one run is kept in the next run with the same profile | View › Focus Point unchecked, app closed, relaunched on the same `userData`: still unchecked | Pass |

## Journey 3: lifecycle (`lifecycle.spec.ts`)

| Test | Asserts | Status |
|---|---|---|
| closing the main window quits the app with no leftover process or main-process error | the process exits; no Electron process left; no main-process error lines | Pass |
| closing the main window while the scoring window is open still quits cleanly | the same, with Tools › Scoring open | Pass (was [#223](https://github.com/synthet/image-scoring-gallery/issues/223)) |

## Journey 4: security (`security.spec.ts`)

| Test | Asserts | Status |
|---|---|---|
| the page has no Node.js access | `require`, `process` and `module` are undefined in the page | Pass |
| the preload API surface matches the reviewed snapshot (no accidental new powers) | the sorted keys of `window.electron` and its nested objects equal `preload-api-surface-win32.json`; update with `--update-snapshots` only after review | Pass |
| IPC rejects malformed arguments | `setShowEyes('yes')` rejects with a "boolean" error | Pass |
| window.open does not create a new window | no new BrowserWindow after `window.open(...)` | Pass (was [#224](https://github.com/synthet/image-scoring-gallery/issues/224)) |
| the main window cannot be navigated to a remote origin | `location.href` to a reachable origin neither commits nor requests the page | Pass (was #224) |
| the media protocol refuses a non-image file outside the photo folders | `media://` fetch of a `.txt` file outside the photo folders doesn't return its contents (403) | Pass (was #224). Image files outside the gallery's folders are still served; see [#237](https://github.com/synthet/image-scoring-gallery/issues/237) |
| the media protocol refuses ".." traversal to a non-image file | `media://<photos>/../outside.txt` doesn't return its contents (403) | Pass (was #224) |
| openExternalUrl hands only backend links to the operating system | a `file://` URL and another origin are refused with an error; a link on the backend origin reaches `shell.openExternal` (stubbed) | Pass (was #224) |

## Journey 5: accessibility (`accessibility.spec.ts`)

axe-core 4.14 with WCAG 2.1 A and AA tags, run in-page with `setLegacyMode(true)`.

| Test | Asserts | Status |
|---|---|---|
| the empty gallery has no WCAG 2.1 A/AA violations | no violations | Pass |
| the folder-mode root dialog has no WCAG 2.1 A/AA violations | same, with the dialog open | Pass |
| the folder grid has no WCAG 2.1 A/AA violations | same, on a folder of generated photos | Pass |
| the viewer has no WCAG 2.1 A/AA violations and Escape closes it | same, with the viewer open; Escape closes it | Pass |
| the viewer close button has an accessible name | a button named /close/ is visible in the viewer | Pass (was [#225](https://github.com/synthet/image-scoring-gallery/issues/225)) |
| secondary text meets the 4.5:1 contrast ratio | no `color-contrast` violations in the library view, folder mode or viewer | Pass (was #225) |

## Journey 6: layout and scaling (`layout.spec.ts`)

"Uncovered" means the element is inside the viewport and is what a click at its centre would hit (`document.elementFromPoint`).

| Test | Asserts | Status |
|---|---|---|
| library view at 1024x640 / 800x600 / 640x480: the sidebar collapses and the header stays usable (3 tests) | toggle `aria-expanded=false`; toggle, title and Refresh uncovered; no horizontal page overflow; the toggle opens the drawer | Pass |
| library view at 1024x640 / 800x600 / 640x480: the drawer can be closed again (3 tests) | after opening, Escape closes it (a click on the backdrop does too) | Pass (was [#226](https://github.com/synthet/image-scoring-gallery/issues/226)) |
| folder mode at 1024x640: the sidebar does not cover the header and grid | the sidebar closes as the window narrows; folder-mode title and first thumbnail uncovered | Pass (was #226) |
| 150% display scaling at 1280x720 | `devicePixelRatio` is 1.5; no horizontal overflow; toggle, title, Refresh and sidebar filters uncovered | Pass |

## Journey 7: large data (`large-data.spec.ts`)

| Test | Asserts | Status |
|---|---|---|
| a 3000-photo folder virtualizes and shows its first thumbnail within budget | first loaded thumbnail within the budget (annotation `first-thumbnail-ms`); "3000 images"; the last photo is reached by wheel scrolling (annotation `scroll-to-end-ms`); at most 120 cards rendered at the top, middle and end | Pass |
| keyboard navigation and select-all reach photos outside the rendered window | End shows the last photo; Ctrl/Cmd+A shows "3000 selected" | Known defect [#227](https://github.com/synthet/image-scoring-gallery/issues/227) |

Budgets and measurements are in [06 - End-to-end (Electron) testing § Budgets](06-e2e-testing.md#budgets-journey-7).

## Journey 8: long operations (`long-operations.spec.ts`)

| Test | Asserts | Status |
|---|---|---|
| import reports progress for every photo and records each one exactly once | File › Import (stubbed dialog) on 25 photos: progress events 1…25 with total 25; "Completed: 25 files" and "Added: 25 · Skipped: 0"; the fake backend recorded each file name once | Pass |
| a failed photo is reported and the rest of the import still completes consistently | one insert fails (HTTP 500): "Added: 24", "Errors:" lists that photo, the other 24 recorded once, progress reaches 25/25, the dialog closes | Pass |
| a running import can be cancelled and keeps what it imported | Cancel during a 400-photo import shows "Import cancelled after N of 400 files"; the Added count equals the photos the fake backend recorded, each once, fewer than 400; the dialog then closes | Pass (was [#228](https://github.com/synthet/image-scoring-gallery/issues/228)); sync and backup cancel: [#238](https://github.com/synthet/image-scoring-gallery/issues/238) |

Sync and backup have no end-to-end test. Sync reads only `.nef` files, and backup selects photos by score from the database.

## Contract layer (Vitest)

`electron/ipcRegistry.test.ts` scans the preload and main-process sources statically:
- every preload channel has exactly one handler, with no duplicates;
- every event is both sent and listened for;
- handlers wrapped in the IPC envelope are unwrapped by the preload.

The envelope check is strict, with no exceptions. Its two former defects, `findNearDuplicates` returning the raw envelope and `openExternalUrl` swallowing failures, were fixed in [#222](https://github.com/synthet/image-scoring-gallery/issues/222).

[← Back to Guides](README.md)
