---
type: "Index"
title: "Planned Features"
description: "Documentation for features not yet implemented."
resource: "docs/features/planned/README.md"
tags: ["features", "gallery-docs", "index", "planned"]
timestamp: 2026-10-10T00:00:00Z
---

# Planned Features

Documentation for features not yet implemented.

- [01 - Windows Native Viewer](01-windows-native-viewer.md) - Native C++/Win32 application for fast image browsing
- [Embedding Applications](embeddings/README.md) - AI-powered similarity search, duplicate detection, tag propagation, and more (8 specs)
- [Single Bird Species per Image (BioCLIP top‑1)](species-conflict-resolution.md) - Assign exactly one `species:*` keyword per bird image — the BioCLIP 2 max-score result; backend `top_k=1` default + backfill
- [Burst Culling Explainability](burst-culling-explainability.md) - Best-frame star, "nearly tied" badge, sub-bursts, score breakdown with reasons, client-side Adjust scoring, diagnostic overlays, compare + zoom-to-eye, species suggestions (depends on backend localization Stage 5–6)
- [Visual evidence overlays — spec (remaining phases)](visual-evidence-overlays-spec.md) - Acceptance criteria and outstanding gallery work
- [Visual evidence overlays — integration plan](visual-evidence-overlays-integration.md) - Phased delivery narrative and **Driftara-specific** look-and-feel
- Shipped viewer slice: [implemented/09-visual-evidence-overlays.md](../implemented/09-visual-evidence-overlays.md)

- [Human Culling Labelling Mode](human-culling-labelling-mode.md) - Blind pick/keep/reject + best frame over the backend's sampled groups, flip-compare loupe, saves to `human_labels` (backend #415)
- [Loupe Subject Tracking](loupe-subject-tracking.md) - Keep a zoomed loupe on the same part of a moving animal across a burst (holds position when unsure; design options measured on owned bursts)
- [Backup Copy Identity](backup-copy-identity.md) - **Data safety:** collision-safe destinations, size + content-hash repeat checks, independent sidecar outcomes, never delete foreign sidecars
- [Archive Picks](archive-picks.md) - One confirmed action copying a folder's picks + sidecars to an archive root, without touching Backup settings
- [Learn Weights From Choices](learn-weights-from-choices.md) - Fit personal score-tuning weights from culling labels and quick A/B prompts; shooting-style presets

[← Back to Features](../README.md)
