# 02 - Near-Duplicate Detection (Frontend)

*Status: **Implemented***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Provide a dedicated maintenance interface to review, manage, and clean up visually identical or near-identical images across the library or within a specific folder.

## UI Integration Points

1. **Duplicate Finder View (`src/components/Duplicates/DuplicateFinder.tsx`)**
   - **Status**: Fully Implemented.
   - Accessible via Sidebar -> "Maintenance" -> "Find Duplicates".
   - **Controls:**
     - Folder scope selection (Restricted to current folder or library-wide).
     - Similarity Threshold slider (Default 0.98).
     - "Scan Now" button with progress indication.
   - **Layout:**
     - Displays sets of duplicates with side-by-side comparison.
     - Highlights pixel dimensions and score differences.
   
2. **Action Workflow**
   - **"Reject Duplicates"**: User can manually select images to reject (rating -1).
   - **"Auto-Reject"**: Logic to keep the highest score/resolution and reject the rest.

3. **IPC Flow**
   - Triggers `window.electron.findNearDuplicates({ threshold, folderPath })`.
   - Results are returned as a structured array of clusters.

## Design Considerations

- **Visual Comparison:** Images are rendered side-by-side for pixel-perfect comparison.
- **Performance:** Scanning large folders is handled as an async IPC call to avoid freezing the renderer thread.
