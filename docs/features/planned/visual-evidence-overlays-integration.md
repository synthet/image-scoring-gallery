---
type: "Planned Feature"
title: "Visual evidence overlays — clean-room integration plan (gallery)"
description: "Phased plan to ship subject evidence layers in ImageViewer with Driftara look-and-feel, distinct from the reference commercial UI."
resource: "docs/features/planned/visual-evidence-overlays-integration.md"
tags: ["features", "gallery-docs", "planned", "culling", "evidence", "overlays", "clean-room"]
timestamp: 2026-09-30T00:00:00Z
---

# Visual evidence overlays — gallery integration plan

*Status: **In progress** (foundation + viewer overlays landed) · Companion to [burst-culling-explainability.md](burst-culling-explainability.md) §4–7.

**Normative spec:** [visual-evidence-overlays-spec.md](visual-evidence-overlays-spec.md) · **Shipped:** [../implemented/09-visual-evidence-overlays.md](../implemented/09-visual-evidence-overlays.md) · **Hub map:** [image-scoring spec index](https://github.com/synthet/image-scoring/blob/main/docs/specs/visual-evidence-overlays/INDEX.md)
Behaviour spec (clean-room): mirror `image-scoring` monorepo clean-room doc **05 — visual diagnostics and inspector overlays**
(import path in backend/gallery docs, not copied from any RE workspace).*

## Provenance (clean-room)

Derived from competitive analysis of a commercial application's **observable** inspector behaviour.
This plan specifies **our** UI architecture, tokens and copy. No code, layout measurements, colour
hex values, or component structure from reverse-engineering workspaces may be pasted into gallery
commits.

## Goal

Give reviewers toggleable **evidence layers** on the full-screen viewer (and later compare view) so
burst-culling scores are inspectable: subject region, segmentation, keypoints, sharpness grid, noise
grid. Layers must feel native to **Driftara Gallery** (VS Code Dark+, Lucide, existing bbox/eye
patterns), not a pixel clone of the reference product.

## Current gallery baseline

| Area | Today | Gap |
|------|--------|-----|
| `ImageViewer` | `BirdBoxOverlay`, optional `EyeKeypointsOverlay` (menu: View → Eyes) | No mask, heatmaps, layer panel, or shortcuts |
| `GalleryGrid` | Same bbox/eye toggles on thumbnails | Heatmaps N/A at grid scale |
| `DiagnosticsModal` | **App** health (IPC, memory) | Rename mentally to “system diagnostics”; unrelated to photo evidence |
| Planned UX | [burst-culling-explainability.md](burst-culling-explainability.md) | Backend evidence API still gating |

**Do not** port reference implementations from other repos (e.g. left-rail drawer, cyan theme, shared
normalization constants). Implement behaviour from the clean-room spec + backend contract; re-fit
numeric thresholds in backend/model, expose only **band labels** and **grid cells** to the gallery.

## Visual differentiation (intentional departures)

| Reference pattern (avoid mimicking) | Driftara direction |
|-------------------------------------|-------------------|
| Fixed left vertical “diagnostics” rail (expanded/collapsed widths) | **Evidence** strip: horizontal chip row under viewer toolbar, or collapsible **right** inspector section aligned with score breakdown |
| Cyan (#06b6d4) as primary overlay accent | Keep **confidence ramp** on regions/keypoints (`birdBboxBorderCss`); use **semantic tokens** for heatmaps ([scoring-evidence-tokens](https://github.com/synthet/image-scoring-ui/blob/main/docs/scoring-evidence-tokens.md): cividis-like ramp, not red→amber→green) |
| Monospace pill badges on image (“subject N%”) | **Sans** caption chip in toolbar or legend card; area % in tooltip, not burned into image corner |
| Bullseye + dashed square eye crop | **Ring markers** (existing eye overlay) + optional **soft halo**; sharpness as **text in inspector**, not on-image badge unless user enables “show metrics on canvas” |
| Bottom-right dark legend pill | **Legend card** docked to inspector column (same width as score breakdown), icon + label per ramp stop |
| Layer names “Box / Mask / Eyes / Focus / Noise” | Copy: **Region**, **Subject mask**, **Keypoints**, **Sharpness map**, **Noise map** (localizable) |
| Keyboard `D` toggles drawer | **`E`** cycles evidence panel; **`1`–`5`** toggle layers (document in viewer shortcuts help) |

All colours: `var(--color-*)` / design package tokens only. Run leakage grep before merge (no vendor
product names in gallery PRs).

## Behaviour (from clean-room spec — implementation checklist)

1. **Layer groups**
   - Structural: region, mask, keypoints — any combination.
   - Analysis: sharpness map vs noise map — **mutually exclusive**; either stacks with structural.
2. **Gating**: disable toggles when backend marks artifact missing; show short reason in inspector.
3. **Coordinates**: normalized to **display-oriented** preview space (same as `bird_bbox` / eye points).
4. **Sidecar**: prefer precomputed grid + RLE mask from backend at score time; viewer does not run ONNX.
5. **Actions**: “Refresh evidence” (re-queue inference job), “Export evidence pack” (PNG layers + JSON).

## Architecture

```text
image-scoring-backend (Stage 6 evidence)
  ├─ POST/GET …/images/{id}/evidence
  ├─ artifacts: mask URL | RLE, keypoints, focus_grid, noise_grid, separation summary
  └─ versioning: weights_version + evidence_schema_version

image-scoring-gallery
  ├─ bridge + api.generated types
  ├─ hooks: useImageEvidence(id), useEvidenceLayers()  // zustand or viewer-local state
  ├─ components/Evidence/
  │     EvidenceLayerChips.tsx      // toggles + gating
  │     RegionOverlay.tsx           // generalize BirdBoxOverlay (primary + alternates)
  │     SubjectMaskOverlay.tsx      // canvas alpha from RLE or PNG
  │     KeypointsOverlay.tsx        // extend EyeKeypointsOverlay + facing glyph (tokenized)
  │     GridHeatmapOverlay.tsx      // single canvas, mode sharpness|noise
  │     EvidenceLegend.tsx
  │     exportEvidenceBundle.ts     // zip via electron main
  └─ ImageViewer.tsx                // stack overlays above img; legend in sidebar slot
```

Shared **math** (Laplacian grid, MAD noise, RLE decode) lives in **backend** or **image-scoring-model**
for production; gallery only **maps cell values → token colours** using server-supplied normalized
`t` in `[0,1]` per cell when available, else maps raw values with documented server breakpoints.

## Phased delivery

### Phase 0 — Design contract (image-scoring-ui)

- Land `scoring-evidence-tokens` in design package (heatmap ramp, layer icons, legend typography).
- Add Storybook/chromatic snapshots for legend + heatmap swatches.
- **Exit:** gallery can import tokens without hard-coded hex in overlay files.

### Phase 1 — Backend artifact surface (image-scoring-backend)

- Extend evidence payload with: `focus_grid`, `noise_grid`, `mask` (RLE or CDN path), `separation`
  (subject/background sharpness ratio as **bands**, not vendor thresholds).
- Align JSON schema with clean-room sidecar **behaviour** (version field, cell sizes documented as
  starting points).
- **Exit:** fixture JSON under `tests/fixtures/evidence/` consumed by gallery vitest.

### Phase 2 — Gallery MVP (viewer only)

- `EvidenceLayerChips` + state; wire region + keypoints (reuse existing overlays behind feature flag).
- Fetch evidence on viewer open; cache per `image.id` session map (pattern: `useEyeKeypoints`).
- Sharpness OR noise canvas overlay from grid; legend in sidebar.
- Unit tests: toggle exclusivity, gating, orientation 1–8 alignment (backend fixtures).
- **Exit:** parity with explainability doc §4 table except mask until Phase 3.

### Phase 3 — Mask + export

- `SubjectMaskOverlay` from RLE decode in worker (keep main thread 60fps).
- Export evidence pack (§7 of explainability doc); distinct from `DiagnosticsModal`.
- **Exit:** manual QA on NEF preview + JPEG; bundle opens in support workflow.

### Phase 4 — Score breakdown coupling

- When [burst-culling-explainability](burst-culling-explainability.md) §2 ships, link criterion rows
  to layers (“show sharpness map” focuses noise off and enables sharpness).
- Adjust-scoring recompute unchanged (client weights only).

### Phase 5 — Compare + grid (optional)

- 2–4 up compare with synced layers; thumbnail grid stays bbox/eyes only.

## Testing & acceptance

- **Visual:** diff overlays against backend-rendered reference PNGs (tolerance), not against any
  commercial app screenshot.
- **Performance:** pan/zoom 60fps with two structural + one heatmap layer on 800px preview.
- **Accessibility:** layer toggles keyboard-focusable; heatmap described in `aria-live` legend text.
- **Clean-room:** `git diff --cached | grep -iE "burst ?pick|bird-eye|rtmpose-tiny-bird"` empty.

## Non-goals (this track)

- Client-side inference or reimplementation of proprietary bird pose models in Electron.
- Renaming `DiagnosticsModal` (system health) in Phase 2 — optional follow-up to reduce confusion.
- Matching reference app animation, rail width, or marketing copy.

## Suggested issues (gallery repo)

1. `feat(evidence): layer state + chips UI (no heatmap)`
2. `feat(evidence): grid heatmap canvas + legend tokens`
3. `feat(evidence): mask RLE worker + overlay`
4. `feat(evidence): export bundle IPC`
5. `docs: viewer shortcuts for evidence layers`

Cross-repo: backend Stage 6 evidence schema + `cross-repo` label on paired PRs.

## References (allowed)

- Gallery: [burst-culling-explainability.md](burst-culling-explainability.md)
- UI tokens: [image-scoring-ui scoring-evidence-tokens](https://github.com/synthet/image-scoring-ui/blob/main/docs/scoring-evidence-tokens.md)
- Backend: [subject-aware culling evidence](https://github.com/synthet/image-scoring-backend/blob/master/docs/planning/subject-aware-culling-evidence.md)
- Clean-room behaviour: **05 — visual diagnostics and inspector overlays** (image-scoring monorepo
  `docs/clean-room/`, not the dirty-room `docs/full/`)
