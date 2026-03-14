# 05 - 2D Embedding Map (Frontend)

*Status: **Planned***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Provide a visual cluster map of the entire photo collection or a specific folder, based on UMAP dimensionality reduction of image embeddings.

## UI Integration Points

1. **New View Mode (`src/AppContent.tsx`)**
   - Add `EMBEDDING_MAP` to the view routing.
   - Accessible via a button in the breadcrumbs or sidebar.

2. **WebGL Renderer (`src/components/EmbeddingMap/EmbeddingMap.tsx`)**
   - Render images as points in 2D space.
   - Points are colored by folder, score, or rating.
   - Interactive zoom/pan.

3. **Point Interaction**
   - **Lasso/Box Selection**: Select multiple images for batch tagging.
   - **Thumbnail Preview**: High-speed thumbnail popups on hover.

## IPC / Data Flow

- **Fetch Coordinates**: `window.electron.getEmbeddingCoordinates({ folderId, method: 'UMAP' })`.
- **Response**: `typed array` or `JSON` containing `id, x, y, color`.

## Design Considerations

- **Scale**: The map should handle 50,000+ images using instanced rendering in WebGL.
- **Clustering**: Visually distinct clusters often represent "bursts" or "locations" automatically.
