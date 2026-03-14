# 04 - Outlier Detection (Frontend)

*Status: **Planned***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Provide visual cues in the main gallery view for images mathematically determined to be "outliers" compared to their folder peers.

## UI Integration Points

1. **Filter Panel Toggle (`src/components/Sidebar/FilterPanel.tsx`)**
   - Add a checkbox/toggle: `[x] Highlight Outliers`.
   - When enabled, the frontend requests outlier data for the current folder.

2. **Gallery Grid Indicators (`src/components/Gallery/GalleryGrid.tsx`)**
   - Overlay a "Warning" or "Outlier" badge on affected thumbnails.
   - Images are cross-referenced by ID from the `find_outliers` response.
   
3. **Outlier Filtering**
   - In the search/filter logic, add an `is_outlier` filter to isolate these images for bulk management.

## IPC / Data Flow

- **Trigger**: `window.electron.findOutliers({ folderPath })`.
- **Response**: `[{ image_id, z_score, reason }]`.
- Frontend maintains an `outlierSet` of IDs to apply conditional styling in the grid.

## Design Considerations

- **Outlier Logic**: Outliers represent images that are visually distinct from the "theme" of the folder (e.g., a random screenshot in a folder of nature photos). 
- **Explainability**: Hovering over the outlier badge might show the "Reason" or similarity to neighbors.
