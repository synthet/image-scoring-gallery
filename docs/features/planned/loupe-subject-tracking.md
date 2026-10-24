---
type: "Planned Feature"
title: "Loupe subject tracking across burst frames"
description: "Status: Planned (proposal, clean-room). Keep a zoomed loupe on the same part of a moving animal while stepping through a burst."
resource: "docs/features/planned/loupe-subject-tracking.md"
tags: ["features", "gallery-docs", "planned", "culling", "viewer", "clean-room"]
timestamp: 2026-10-10T00:00:00Z
okf_version: 0.1
---

# Loupe subject tracking across burst frames

When a user is zoomed in on a detail (usually an eye) and steps to the next burst frame, the loupe should
land on the same part of the animal, not on the same pixel coordinates.

*Status: **Planned (proposal)** · Owner: TBD · Extends
[burst culling explainability §5](burst-culling-explainability.md#5-compare-view--zoom-to-subject) and the
loupe in [human culling labelling mode](human-culling-labelling-mode.md).*

## Provenance (clean-room)

These are UX ideas from a competitive analysis of a commercial wildlife burst-culling application's
user-visible behaviour and documentation. This page describes behaviour only: no code, assets, copy
text, algorithm structure or identifiers from that product. The design options are standard computer
vision chosen by us. Every threshold is ours to fit on our own bursts.

## Problem

Comparing eye sharpness across a burst is the core culling task. The planned loupes keep the same
**image-relative position** across frames (labelling mode acceptance) or synchronise pan/zoom
(explainability compare view). That works on a tripod. With a hand-held lens or a moving bird, the
subject drifts between frames, the loupe shows sky or branches, and the user has to re-pan on every frame.

Explainability §5 mentions re-centring hand-held bursts. This page states the required behaviour and
lists our design options for measuring.

## Current state

- [`ImageViewer.tsx`](../../../src/components/Viewer/ImageViewer.tsx) shows the image fitted
  (`objectFit: contain`) with no zoom or pan yet. A loupe is a prerequisite and is planned in both
  linked specs.
- The backend supplies, per frame, detection regions and (when present) eye keypoints in normalized
  display-oriented coordinates. These are already rendered by the evidence overlays
  ([implemented 09](../implemented/09-visual-evidence-overlays.md)).

## Behaviour (what the user sees)

- While zoomed in, stepping to the next or previous burst frame keeps the loupe on the **same part of
  the animal**: the near eye, the bill, a paw.
- When the gallery cannot place that detail confidently, the loupe **holds position**. It never jumps to
  a different feature. A wrong jump costs more than a manual re-pan.
- **User framing wins.** A spot the user framed (drag, scroll zoom, double-click) is the detail to
  follow. The fit-to-screen and 1:1 shortcuts aim at the subject (explainability §5) and do not choose a
  point to follow.
- The loupe never pans past the image edge.
- A small indicator shows whether the loupe followed the subject or held position. One key toggles
  tracking.

## Design (ours, to evaluate)

The method is an engineering choice made here, not taken from the reference. Candidates, in order of
cost:

| Option | Signal | Notes |
|---|---|---|
| A | Backend evidence only: map the point through the subject region, or onto the matching eye keypoint | Cheap; uses stored regions and keypoints; fails when detection fails |
| B | Image registration between consecutive renditions (phase correlation, or feature matching such as ORB/AKAZE with RANSAC), restricted to the subject region | Standard computer vision; works without keypoints; needs a worker |
| C | A + B, with a confidence gate | Highest expected accuracy; most work |

Pick by measurement: run each option over owned hand-held bursts against reviewer-placed ground-truth
points, and record hit rate, wrong-jump rate and step latency. The gate threshold is fitted on the same
set, tuned for a near-zero wrong-jump rate first.

## Architecture constraints

- **No client ML.** Option A uses backend evidence only. Option B is classical image processing on the
  rendition already displayed, run in a Web Worker so frame stepping stays responsive.
- Work in the same full-resolution rendition the loupe displays (the RAW's embedded JPEG), in display
  orientation, so coordinates agree with the overlays.
- Missing evidence degrades gracefully: no region → option B only; rendition still loading → hold
  position.

## Labelling-mode caveat

[Human culling labelling mode](human-culling-labelling-mode.md) must not reveal model output. Option A
places the loupe from model detections, which hints at where the model thinks the subject is. In
labelling mode:
- tracking uses **image registration only** (option B), anchored on the labeller's own click;
- it is off unless the labeller turns it on.

## Delivery slices

| Slice | Scope | Depends on |
|---|---|---|
| 1 | Option A with region mapping (cheap) | Loupe zoom/pan in the viewer |
| 2 | Option A eye-keypoint targeting | Keypoint evidence on the frame |
| 3 | Option B in a worker, then C if the measurement favours it | Slice 1; evaluation set |

## Non-goals

- Tracking during normal (non-burst) browsing.
- Persisting anchors across sessions.
- Any server-side change; this is display behaviour only.

## Acceptance (starting point)

- Step a zoomed loupe through an owned fixture burst of a moving bird. On every frame, the loupe is
  either on the same feature (judged by a reviewer against the frame) or did not move. It never lands on
  a different feature.
- A tripod burst behaves exactly like the image-relative default.
- Orientation fixtures 1–8: the tracked point and the keypoint overlay agree within 1 display pixel.
- Frame stepping latency with tracking stays within the viewer's existing budget on a 30-frame burst.

## Open questions

- Which option ships, and its confidence gate, is decided by the measurement in *Design*.
- Should the compare view track each pane independently from a shared anchor, or chain frame to frame?
