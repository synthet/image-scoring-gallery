---
type: Implemented Feature
title: Visual evidence overlays (viewer)
description: Inspector evidence layers — chips, heatmaps, mask, legend, breakdown hooks, IPC to backend evidence API.
resource: docs/features/implemented/09-visual-evidence-overlays.md
tags: [features, gallery-docs, implemented, evidence, overlays, clean-room]
timestamp: 2026-09-30T00:00:00Z
---

# Visual evidence overlays (viewer)

**Purpose:** Let reviewers toggle **evidence layers** on the full-screen image viewer to inspect why burst-culling scores look the way they do.

**User-visible behavior:**

- Press **E** to show/hide the Evidence block in the right inspector.
- Press **1–5** to toggle **Region**, **Subject mask**, **Keypoints**, **Sharpness map**, **Noise map** (when gated on by API).
- Sharpness and noise maps are **mutually exclusive**; structural layers can combine with either map.
- Legend and limitation copy appear in the inspector; score breakdown rows can enable a linked layer.
- **Export pack** (Electron): writes JSON evidence payload to a chosen folder via main process.

**Primary code paths:**

| Area | Path |
|------|------|
| Fetch + cache | `src/hooks/useImageEvidence.ts` |
| Layer state | `src/hooks/useEvidenceLayers.ts` |
| UI | `src/components/Evidence/*` |
| Viewer wiring | `src/components/Viewer/ImageViewer.tsx` |
| IPC | `api:evidence:get-image`, `api:evidence:export-pack` in `electron/ipc/registerDbHandlers.ts` |
| HTTP | `bridge.getImageEvidence` → `/gallery-api/backend/images/{id}/evidence` |

**Backend contract:** [VISUAL_EVIDENCE_API.md](https://github.com/synthet/image-scoring-backend/blob/master/docs/technical/VISUAL_EVIDENCE_API.md)

**Design tokens:** [@synthet/image-scoring-design evidence spec](https://github.com/synthet/image-scoring-ui/blob/main/docs/features/evidence-overlays-design-spec.md) — no hard-coded heatmap hex in overlay components.

**Tests:** `src/components/Evidence/evidenceLayerChips.test.tsx`, `src/hooks/useEvidenceLayers.test.ts`

**Remaining work:** [planned/visual-evidence-overlays-spec.md](../planned/visual-evidence-overlays-spec.md) (compare view sync, full mask worker offload, refresh job, parity PNG QA).

**Related:** [burst-culling-explainability.md](../planned/burst-culling-explainability.md) · Integration narrative [visual-evidence-overlays-integration.md](../planned/visual-evidence-overlays-integration.md)
