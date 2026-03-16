# Embedding Features TODO List

This document tracks the remaining work for the embedding-based features in the Electron Gallery.

> **Source of truth & update order:** Embeddings feature-detail mirror (owner: feature maintainers). Update only after `TODO.md` and `docs/planning/01-roadmap-todo.md`; use `docs/integration/TODO.md` to confirm backend milestone status before changing Gradio/API states.

## 🟢 Implemented
- [x] **Diversity-Aware Selection**: Settings and MMR logic integrated.
- [x] **Near-Duplicate Detection**: Duplicate finder view and IPC bridge.
- [x] **"More Like This" Search**: Similarity search drawer and context menu.

## 🟡 In Progress
- [ ] **Gradio Integration**: Enhance IPC/WebSocket bridge for real-time AI updates (job progress subscription still pending).

## 🔴 Planned (Missing)
### Feature 3: Tag Propagation
- [ ] Implement `propagateTags` service call (dry-run/apply).
- [ ] Add "AI Suggestions" section to `ImageViewer.tsx` metadata sidebar.
- [ ] Add "Accept/Reject" interaction logic.

### Feature 4: Outlier Detection
- [ ] Add "Show Outliers" toggle to `FilterPanel.tsx`.
- [ ] Implement visual badge/highlight for outliers in `GalleryGrid.tsx`.
- [ ] Connect to backend outlier detection endpoint.

### Feature 5: 2D Embedding Map
- [ ] Create `EmbeddingMap.tsx` component.
- [ ] Implement WebGL-based visualization of 1280-d feature vectors projected to 2D.
- [ ] Add navigation to map view in `AppContent.tsx`.

### Feature 6: Smart Stack Representative
- [ ] Add "Smart Cover" toggle to `SelectionSettings.tsx`.
- [ ] Implement cover selection logic based on stack centroid in IPC/Backend.
