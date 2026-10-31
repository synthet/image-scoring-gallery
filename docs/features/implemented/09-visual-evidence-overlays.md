---
type: Implemented Feature
title: Visual evidence overlays (viewer)
description: Compact on-demand sharpness, peaking, noise, subject mask and head diagnostics shared with the web inspector.
resource: docs/features/implemented/09-visual-evidence-overlays.md
tags: [features, gallery-docs, implemented, evidence, overlays]
timestamp: 2026-10-30T16:20:00Z
---

# Visual evidence overlays (viewer)

The right inspector contains four icon-only controls in one row: blue dashed Bounding Box, violet Eyes, camera Focus Point and More diagnostics. Their accessible names and tooltips identify them; there is no visible heading. Gallery's three existing controls remain synchronized with the native View menu. The Image menu offers Find Similar Images while an image is open.

More diagnostics offers sharpness map, focus peaking, noise map, subject mask and eyes/head detail. Opening the menu checks availability without starting computation. Selecting a layer requests it explicitly. Pending, unavailable and failed states carry explanations; Refresh retries selected layers and Cancel releases this viewer's subscriptions.

The diagnostic menu renders above the viewer through a portal, outside the scrolling inspector. Its position and height track the trigger, scrolling and window size, keeping controls visible within the viewport. Escape restores focus to More diagnostics.

- P cycles peaking Off, Outlines, Texture and Both. Shift+P hides/restores its last mode. F toggles camera autofocus independently. E opens/closes the diagnostic menu. Text inputs retain their keyboard behavior.
- Sharpness and noise heatmaps are mutually exclusive. Peaking, masks and head geometry can combine with either. Head detail enables Eyes and reuses eye markers; switching Eyes off disables head detail.
- Layer choices last for the app session and start off on launch. Opacity and background dimming are saved preferences.
- Both apps display the backend's exact decoded preview before overlaying its artifacts. Late responses from another image are ignored. Reduced source previews cannot enable native peaking.
- Subject masking uses real optional local segmentation and dims background pixels. No detection rectangle is presented as a mask. Numeric head/eye ratios and model confidence are separate; no uncalibrated quality grades are shown.
- Export evidence pack remains available in Gallery's diagnostic menu through its existing v1 export API.

## Implementation

| Area | Source |
|---|---|
| Shared types | electron/diagnosticTypes.ts; renderer re-export in src/types/diagnostics.ts |
| Session state and asynchronous requests | src/hooks/useDiagnostics.ts |
| Controls, legend and registered artifacts | src/components/Diagnostics/ |
| Viewer wiring | src/components/Viewer/ImageViewer.tsx |
| Electron transport | electron/apiService.ts, preload.ts and ipc/registerDbHandlers.ts |
| Browser transport | src/bridge.ts and server/index.ts binary proxy |
| Web inspector | Backend frontend/src/components/images/BirdBoxPreview.tsx |

The [backend API contract](https://github.com/synthet/image-scoring-pipeline/blob/main/docs/technical/VISUAL_EVIDENCE_API.md) owns provenance, versioned calculations, local provider provisioning, cancellation, immutable artifacts and the default 2 GiB derived cache. Version 1 remains compatible for existing tools; the viewers use explicit version 2 diagnostic requests. Source files, scoring and database schema are unchanged.

## Verification

Tests cover no computation on open, mutually exclusive maps, peaking quick restore, stale image responses, head/Eyes interaction, matching-preview registration, inaccessible source variants, EXIF geometry 1–8, binary transport, subscription deduplication/cancellation, model preemption, cache isolation/eviction and synthetic blur/noise. A local real-image smoke test completed all five layers for image 71662 at 8256 by 5504. This verifies integration, not statistical calibration across a photographic corpus.

Use `npx tsc -b` for the complete renderer build check and `npx tsc -p electron/tsconfig.json --noEmit` for Electron. Renderer defaults live in the browser-safe `electron/scoringSortOptions.ts`; shared evidence and review response types are exposed by preload without importing renderer components.

The inspector uses matching controls, state hook and artifact renderer. Existing v1 Evidence components remain available for compatibility consumers. Broader comparison-view and calibration work is tracked in the [evidence specification](../planned/visual-evidence-overlays-spec.md).
