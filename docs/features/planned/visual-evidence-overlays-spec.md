---
type: Feature Spec
title: Visual evidence overlays — acceptance and remaining phases
description: Formal acceptance criteria and outstanding gallery/backend work beyond the shipped viewer slice.
resource: docs/features/planned/visual-evidence-overlays-spec.md
tags: [features, gallery-docs, planned, evidence, overlays, clean-room]
timestamp: 2026-09-30T00:00:00Z
---

# Visual evidence overlays — specification (remaining)

**Provenance:** derived from competitive analysis of a commercial application's observable behaviour; contains no code, identifiers, fitted constants or model artefacts from it.

**Shipped baseline:** [implemented/09-visual-evidence-overlays.md](../implemented/09-visual-evidence-overlays.md)

**Behaviour authority:** [image-scoring clean-room 05](https://github.com/synthet/image-scoring/blob/main/docs/clean-room/05-diagnostics-and-visual-inspection.md)

## Layer behaviour (normative)

| Layer | Client rule |
|-------|-------------|
| Region | Draw primary `bird_bbox` / `region_bbox` when `gates.region` |
| Subject mask | Canvas veil + contour from `mask_rle` when `gates.mask` |
| Keypoints | Reuse eye overlay when `gates.keypoints` and points exist |
| Sharpness map | Canvas from `focus_grid`; requires `gates.focus_grid` |
| Noise map | Canvas from `noise_grid`; requires `gates.noise_grid`; disables sharpness when on |

## Gating

- Disabled chips when corresponding `gates.*` is false.
- Inspector lists `limitations[]` with copy from design package `LIMITATION_LABEL`.

## Remaining phases

| Phase | Deliverable | Owner |
|-------|-------------|--------|
| 3b | Mask decode in dedicated worker; 60fps pan/zoom with two structural + one heatmap | Gallery |
| 4 | “Refresh evidence” queues backend re-inference; distinct from system Diagnostics modal | Gallery + backend |
| 5 | Compare view synced layers (`EvidenceCompareSyncedLayers`) | Gallery |
| 5 | Breakdown ↔ layer focus when explainability §2 ships | Gallery |
| 6 | Parity vs backend fixture PNGs (±1px orientation fixtures) | Gallery + backend |

## Acceptance

- No client ONNX for evidence layers.
- Leakage grep empty on gallery PRs (`burst ?pick|bird-eye|rtmpose-tiny-bird`).
- Keyboard: **E**, **1–5** documented in viewer help.
- Heatmaps use design-package ramps only.

## References

- [visual-evidence-overlays-integration.md](visual-evidence-overlays-integration.md) — architecture narrative
- [burst-culling-explainability.md](burst-culling-explainability.md) — stars, breakdown, adjust scoring
- Hub: [specs/visual-evidence-overlays/INDEX.md](https://github.com/synthet/image-scoring/blob/main/docs/specs/visual-evidence-overlays/INDEX.md)
