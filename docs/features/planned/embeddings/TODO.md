# Embedding Features TODO List

This document tracks remaining work for embedding-related features in the Electron Gallery.

## ✅ Implemented
- [x] Diversity-Aware Selection: settings + MMR logic integrated.
- [x] Near-Duplicate Detection: duplicate finder view + bridge.
- [x] "More Like This": similarity drawer + backend query path.

## 🟡 In Progress
- [ ] Gradio/Backend integration hardening (job streaming and richer status wiring still pending).
- [ ] Feature 5 (2D Embedding Map): scaffolded UI route and placeholder component; backend projection + renderer still pending.
- [ ] Feature 6 (Smart Stack Representative): toggle + persistence + request threading scaffolded; backend representative selection still pending.

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
