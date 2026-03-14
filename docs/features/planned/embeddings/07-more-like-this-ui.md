# 07 - More Like This UI (Frontend)

*Status: **Implemented***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Provide a cross-folder semantic search feature, letting users find images visually similar to a chosen reference image.

## UI Integration Points

1. **Results Sidebar (`src/components/Viewer/SimilarSearchDrawer.tsx`)**
   - **Status**: Fully Implemented.
   - Sliding panel on the right side of the `ImageViewer`.
   - Displays similar matches with percentage indicators.
   - Includes a "Jump to Folder" action for each result.

2. **Context Menu & Viewer Integration**
   - Right-click image -> "Find Similar Images".
   - Magnifying glass icon in `ImageViewer` triggers the drawer.

## IPC / Data Flow

- Uses `window.electron.searchSimilarImages({ imageId, limit, minSimilarity })`.
- Fetches real-time neighbors using the MobileNetV2 embedding index.

## Design Considerations

- **Threshold Control**: Users can adjust the minimum similarity threshold dynamically within the drawer.
- **Visual Feedback**: Matches are rendered with a "Similarity %" badge.
