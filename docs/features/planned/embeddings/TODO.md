# Embedding Features TODO List

This document tracks remaining work for embedding-related features in the Electron Gallery. **Canonical backlog:** repo-root [`TODO.md`](../../../../TODO.md). **Workflow / sync order:** [`docs/project/00-backlog-workflow.md`](../../../project/00-backlog-workflow.md).

## ✅ Implemented
- [x] Diversity-Aware Selection: settings + MMR logic integrated.
- [x] Near-Duplicate Detection: duplicate finder view + bridge.
- [x] "More Like This": similarity drawer + backend query path.

## 🟡 In Progress
- [ ] **Gradio / pipeline bridge**: Broaden IPC/WebSocket coverage beyond `job_progress` (subscription is done: `useGalleryWebSocket` → `JobProgressBar` / `useJobProgressStore`). Remaining: queue/log pipeline parity with backend milestones.
- [ ] **Feature 5 (2D Embedding Map):** `EmbeddingMap.tsx` is a **placeholder scaffold** (props + loading/error UI); projection endpoint, WebGL/canvas renderer, and interactions remain.
- [ ] **Feature 6 (Smart Stack Representative):** UI toggle/persistence/threading partially scaffolded; backend centroid/hybrid representative selection and UI polish remain.

## 🔴 Planned
### Feature 3: Tag Propagation
- [ ] Wire full `propagateTags` dry-run/apply UX.
- [ ] Add AI suggestion acceptance/rejection workflow in image details UI.

### Feature 4: Outlier Detection
- [ ] Add outlier controls to filtering UI.
- [ ] Add outlier highlighting/badging in grid.
- [ ] Add endpoint integration and result state handling.

### Feature 5: 2D Embedding Map (remaining)
- [ ] Add embeddings projection endpoint to bridge/backend.
- [ ] Replace placeholder with performant canvas/WebGL renderer.
- [ ] Add map interactions (pan/zoom/hover/lasso).

### Feature 6: Smart Stack Representative (remaining)
- [ ] Implement backend representative-image selection (embedding centroid or hybrid).
- [ ] Expose representative metadata to frontend stack cards.
- [ ] Add UI marker/badge explaining representative-selected covers.
