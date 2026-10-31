---
type: "Implemented Feature"
title: "Representative preview (opt-in browsing view)"
description: "Opt-in, read-only folder view that collapses groups of similar burst frames to one representative card from a study manifest, with one-click expansion and fallback to the ordinary grid."
resource: "docs/features/implemented/10-representative-preview.md"
tags: ["features", "gallery-docs", "implemented", "navigation", "dedupe"]
timestamp: 2026-10-31T00:00:00Z
okf_version: 0.1
---

# Representative preview (opt-in browsing view)

**Purpose:** cut thumbnail clutter in long bursts without hiding anything for good. The operator opens a study manifest for the current folder. Each group of similar frames then shows as one card with a count badge, and one click shows every frame of the group. Nothing is rated, flagged, moved or deleted.

**Primary code:**
- [`electron/representativePreview.ts`](../../../electron/representativePreview.ts): manifest validation and cards (pure).
- [`electron/ipc/registerStudyHandlers.ts`](../../../electron/ipc/registerStudyHandlers.ts): file picker and read-only loader.
- [`src/hooks/useRepresentativeView.ts`](../../../src/hooks/useRepresentativeView.ts): view state.
- [`src/components/Gallery/GalleryGrid.tsx`](../../../src/components/Gallery/GalleryGrid.tsx): the representative card.
- [`src/AppContent.tsx`](../../../src/AppContent.tsx): sidebar switch, Back/Escape and the count.

## Where the manifest comes from

The manifest uses schema `driftara-representative-preview/1`. It is written by the `represent-export` study command in **image-scoring-skills** (`scripts/neardupe_study/experiments/browse_export.py`), which runs that repo's existing representative selector over one frozen shoot. It lists:
- every frame by DB `image_id`, with its catalog flags at the freeze;
- groups (a representative and its members) and singletons;
- frames that must always show on their own.

This is a local preview of a study artifact, not a backend contract. Study groups are kept apart from persisted backend stacks. If the view becomes a service, its read model belongs in the backend canonical contract and OpenAPI first.

## Behaviour

| Step | What happens |
|---|---|
| Turn on **Representatives** (sidebar, folder open) | Main process opens a JSON file picker, reads the file (64 MB cap), hashes it, and reads the folder's rows and raw flags. Stacks mode turns off. |
| Manifest matches the folder | Grid shows one card per group (layered card, member count badge) plus individual frames, in capture order. Header count reads `representatives (N hidden)`. |
| Click a group card | Grid shows that group's frames, representative first. Clicking a frame opens the viewer as usual. |
| **Back** or **Escape** | Returns to the representative grid and scrolls back to the group's card. |
| Turn off, or turn on **Stacks** | Ordinary grid. |

Frames always get their own card when any of these holds:
- the manifest marks them protected, for example exported or a culling override;
- their identity was unresolved at export, or they are listed in `always_visible`;
- their live rating, label or stored pick status differs from the value frozen in the manifest. The pipeline rates and labels every frame, so a change since the freeze is what marks a user's own edit.

Opening a group card never selects or acts on its hidden members.

## Fallback to the ordinary grid

| Reason | Trigger |
|---|---|
| `cancelled` | No file chosen. There is no notice for this one. |
| `unreadable` | File too large, not JSON, or the browser build (no main process) |
| `invalid_manifest` | Wrong schema, missing sections, a group whose representative is not a member |
| `incomplete_membership` | A frame without an image id, listed twice, or in no card |
| `stale_membership` | Folder image ids differ from the manifest's, or rows changed while loading |
| `flags_unavailable` | `images.pick_status` is missing, so user edits cannot be detected |
| `filters_active` | Sidebar filters or **Subfolders** are on; the view needs the whole folder |
| `folder_changed` | An image was removed from the folder while the view was open |
| (reset) | Selecting another folder drops the preview |

Every reason except `cancelled` shows a one-line notice under the switch.

## IPC

| Bridge | IPC channel | Main-process reads |
|---|---|---|
| `loadRepresentativePreview(folderId)` | `study:load-representative-preview` | The chosen file; `getFolderImageFlags` (`SELECT id, rating, label, pick_status`), then `getImagesByStack(null, { folderId })` |

The browser bridge returns an `unreadable` fallback.

## Tests

- [`electron/representativePreview.test.ts`](../../../electron/representativePreview.test.ts): one card per group, every frame once, protected/unresolved/changed frames shown, all fallbacks.
- [`electron/ipc/registerStudyHandlers.test.ts`](../../../electron/ipc/registerStudyHandlers.test.ts): loader hash and rows, oversize/unparsable/drift fallbacks, cancelled picker, missing folder.
- [`src/hooks/useRepresentativeView.test.tsx`](../../../src/hooks/useRepresentativeView.test.tsx): open and close a group, return target, expanding every card reproduces the folder exactly once, fallbacks on filters/folder change/removal. The bridge mock exposes only the read-only loader.
- [`src/components/Gallery/GalleryGrid.test.tsx`](../../../src/components/Gallery/GalleryGrid.test.tsx): a group card opens its group and a single frame opens the viewer.

Real-data check (2026-10-31), shoot 2026-01-19 (Z8, folder 194):
- 3,423 frames became 2,976 cards, 294 of them groups.
- Expanding all groups covers the folder's rows exactly once, with 0 frames changed since the freeze.
- Removing one row falls back with `stale_membership`.
