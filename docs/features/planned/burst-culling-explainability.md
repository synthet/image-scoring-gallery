---
type: "Planned Feature"
title: "Burst culling explainability — best frame, nearly tied, score breakdown, Adjust scoring, overlays"
description: "Status: Planned (proposal, clean-room). Gallery side of the backend subject-aware culling evidence plan."
resource: "docs/features/planned/burst-culling-explainability.md"
tags: ["features", "gallery-docs", "planned", "culling", "explainability", "clean-room"]
timestamp: 2026-09-24T00:00:00Z
---

# Burst culling explainability

*Status: **Planned (proposal)** · Owner: TBD · Backend dependency:
[subject-aware culling evidence](https://github.com/synthet/image-scoring-backend/blob/master/docs/planning/subject-aware-culling-evidence.md),
scheduled inside the
[localization rollout](https://github.com/synthet/image-scoring-backend/blob/master/docs/architecture/pipeline/localization-rollout.md) Stage 6.*

## Provenance (clean-room)

These are UX ideas from a competitive analysis of a commercial wildlife burst-culling application's
user-visible behaviour and documentation. This page describes behaviour only: no code, assets, copy
text or identifiers from that product. The layout and visual language follow our own
[design system](https://github.com/synthet/image-scoring-ui) and
[UX/UI constitution](https://github.com/synthet/image-scoring-ui/blob/main/docs/UX_UI_CONSTITUTION.md).

## Problem

In a burst, the gallery today shows fixed full-frame model columns (`score_general`, LIQE, AVA, …)
that barely move between frames. `StackAnalyticsBanner` exposes a raw `score_gap_top_two`, but the
user still has to answer three questions alone:
- Which frame is best?
- Is it clearly best?
- Why?

The backend plan adds subject-conditioned sub-scores, bands, reasons and a burst ranking. This spec
is how the gallery shows them.

## Gating rule

Everything here reads the backend **evidence endpoint** (proposed `/api/images/{id}/evidence` plus a
stack-scoped variant).

Until a criterion passes the backend's display gate, it:
- is hidden, or
- is shown under a visible **"experimental"** label when a settings toggle is on

The gallery never computes evidence itself. It only re-weights evidence the backend supplies.

## Features

### 1. Best frame and "nearly tied"

- The stack/sub-burst grid shows a **best-frame star** on the burst winner. The backend decides it:
  max composite, ties broken by eye sub-score, then filename.
- A **nearly tied** badge appears on the burst when ≥ 2 frames are within 5 points of the best. It
  says "you should look", not "we decided".
- `StackAnalyticsBanner` switches from the raw top-two gap to this rule, and still shows the gap in a
  tooltip.
- Continuous **sub-bursts** (backend 0.5 s split) nest inside today's stacks/sub-stacks in
  `useStacksMode`. A 120 s stack can hold several sub-bursts, each with its own star.

### 2. Score breakdown (Viewer sidebar)

- Six rows: focus, eye, exposure, composition, noise, context. Each row shows a 0–100 bar, a named
  band ("slightly soft") and a weight.
- **Reason chips:** up to two positive and two negative, from backend bands ("Eye sharp", "Highlights
  clipped on subject").
- **Limitations** shown in muted text: "no subject found", "eye not verifiable", "small subject".
- **Three separate confidences:** detector, evidence and decision are never merged (backend epic
  invariant).
- The existing full-frame model scores stay in their own collapsible section. The two are not mixed.

### 3. Adjust scoring (client-side re-derivation)

- Panel with:
  - presets: Balanced, Sharpness-first, Composition-first, **Technical only**
  - per-criterion weight sliders (auto-renormalised)
  - toggles for the no-subject cap and the head-unverified penalty
- **Recomputes the composite, burst best and nearly-tied in the renderer** from stored sub-scores.
  No backend call, no inference. Recompute follows the backend's documented formula and
  weights-version. A unit-test fixture shared with the backend guarantees the two agree.
- A shown "Adjusted" indicator lets the user reset. The profile is stored per user in local settings.
- Adjusting **never writes back** to backend scores. It only affects sort order, stars and badges in
  this view. `useScoringSortOptions` gains an "Adjusted composite" option.
- A **keeper score** option shows the calibrated keep probability instead of the composite, when the
  backend supplies calibration.

### 4. Diagnostic overlays (Viewer)

Toggleable layers, each with a keyboard shortcut. All coordinates are in the backend's normalized
display-oriented space.

| Layer | Content | Builds on |
|---|---|---|
| Regions | all regions; primary highlighted; confidence colour | `BirdBoxOverlay` → generalized `RegionOverlay` |
| Mask | semi-transparent subject mask | mask artifact URL |
| Keypoints | eye/head points, visibility, facing arrow | keypoint artifacts |
| Focus map | coarse grid heatmap of sharpness | evidence grid |
| Noise map | coarse grid heatmap of noise sigma | evidence grid |

Heatmap and band colours come from new tokens in `@synthet/image-scoring-design` (see that repo's
`docs/scoring-evidence-tokens.md`).

### 5. Compare view + zoom-to-subject

- Compare 2–4 frames of a burst side by side, with synchronized pan/zoom.
- **Zoom to eye/subject:** one key jumps to 100% centred on the primary eye keypoint, or on the
  region centre, in every compared frame. For hand-held bursts where the subject drifts, re-centre
  each frame by a small template match around the previous frame's point, within a bounded search
  window.
- Optional **focus peaking** overlay computed in a Web Worker on the displayed rendition.

### 6. Species suggestions popover

- A ranked candidate list from region-first BioCLIP (backend Stage 5).
- Marks **propagated from burst-mate** suggestions, plus a folder-level "Suggested" shortlist on top.
- Accepting a suggestion writes the `species:*` keyword through the existing keyword API. Nothing is
  auto-applied.
- Compatible with [single species per image](species-conflict-resolution.md): accepting a candidate
  *replaces* the image's species keyword. The popover is only an override path for the top-1 default.

### 7. Diagnostics bundle export

"Export diagnostics for this frame" saves:
- the overlays as PNGs
- the evidence JSON
- the rendition identity

Useful for bug reports and parity checks. Unlike the system-level `DiagnosticsModal`, this is per
photo.

## Non-goals

- Client-side ML inference.
- Changing XMP/rating writes. Rating/label policy stays in the backend unified metadata writer.
- Showing any evidence the backend marks as shadow-only, unless the experimental toggle is on.

## Acceptance

- Recompute parity: for a fixture burst, renderer composites equal the backend's, to the integer.
- Overlays align within 1 display pixel on EXIF orientations 1–8. Reuse backend orientation fixtures.
- 60 fps pan/zoom in a 4-up compare on a 45 MP NEF preview.
- A virtualized grid with stars/badges shows no regression on a 10k-image folder.

## Dependencies and order

1. Backend sub-burst split + best/nearly-tied fields: Feature 1, which can ship early because it uses
   the composite the backend already has.
2. Backend evidence endpoint (after the Stage 6 gate): Features 2, 3, 4.
3. Backend Stage 5 region species: Feature 6.
