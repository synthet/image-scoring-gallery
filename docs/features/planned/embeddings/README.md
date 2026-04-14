# Embedding Applications — gallery hub

**Source of truth (algorithms, API, DB):** **[image-scoring-backend `docs/plans/embedding/`](https://github.com/synthet/image-scoring-backend/tree/main/docs/plans/embedding)** — start with [`EMBEDDING_APPLICATIONS.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/embedding/EMBEDDING_APPLICATIONS.md) and [`EMBEDDING_APPLICATIONS_INDEX.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/embedding/EMBEDDING_APPLICATIONS_INDEX.md). Do not duplicate long backend prose here.

This folder holds **one idea per file** for **Electron / React / IPC / UX** only (what the desktop app wires up). Each page should link back to the matching backend spec.

---

## Index (UI / IPC)

- [00 - Summary](00-summary.md) — Gallery-facing overview (links backend for depth)
- [01 - Diversity Selection](01-diversity-selection.md) — **Implemented** (MMR-based stack reranking)
- [02 - Near-Duplicate Detection](02-near-duplicate-detection.md) — **Implemented** (Maintenance view)
- [03 - Tag Propagation](03-tag-propagation.md) — **Planned**
- [04 - Outlier Detection](04-outlier-detection.md) — **Planned**
- [05 - 2D Embedding Map](05-2d-embedding-map.md) — **Planned**
- [06 - Smart Stack Representative](06-smart-stack-representative.md) — **Planned**
- [07 - More Like This UI](07-more-like-this-ui.md) — **Implemented**
- [08 - Gradio Integration](08-gradio-integration.md) — **In progress** (WebSocket / IPC bridge)

[TODO.md](TODO.md) — embedding UI slice only (sync with root [`TODO.md`](../../../TODO.md)).

[← Back to Planned Features](../README.md)
