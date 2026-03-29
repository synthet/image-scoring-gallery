# 05 - 2D Embedding Map (Frontend)

*Status: **In Progress (Scaffolded on March 28, 2026)***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Provide a visual cluster map of the entire photo collection or a specific folder, based on dimensionality reduction (UMAP/t-SNE) of image embeddings.

## Current Implementation Phase

A minimal scaffold now exists so backend integration can proceed incrementally:

1. **View routing is available** in `src/AppContent.tsx` via the `embeddings` app view.
2. **Component placeholder exists** at `src/components/Embeddings/EmbeddingMap.tsx`.
3. **State contract is established** for `loading`, `error`, `empty`, and `points` rendering.

## UI Integration Points

1. **App View (`src/AppContent.tsx`)**
   - `embeddings` route is selectable from sidebar view navigation.
   - Current implementation renders the placeholder `EmbeddingMap` component.

2. **Map Renderer (`src/components/Embeddings/EmbeddingMap.tsx`)**
   - Props contract includes projected point coordinates (`x`, `y`) and image identity (`id`).
   - Current rendering is intentionally non-WebGL and placeholder-only.

3. **Point Interaction**
   - Single-point callback contract is present (`onSelectPoint`) to open/navigate images.
   - Future lasso/box selection and hover previews remain planned.

## IPC / Data Flow (Planned)

- **Fetch Coordinates**: extend bridge/electron API with an embeddings projection endpoint.
- **Expected Response**: list/typed payload with `id, x, y` and optional display metadata.

## Design Considerations

- **Scale target**: 50k+ points, requiring batched rendering (WebGL/canvas).
- **Progressive loading**: support folder-scope loading first, then full library.
- **State resiliency**: keep loading/error/empty states stable during backend rollout.
