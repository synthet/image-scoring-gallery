# 03 - Tag Propagation (Frontend)

*Status: **Planned***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Provide a frictionless UX for accepting or rejecting AI-propagated tags based on nearest neighbors in embedding space.

## UI Integration Points

1. **Metadata Section (`src/components/Viewer/ImageViewer.tsx`)**
   - Instead of a standalone `MetadataPanel`, this feature will be integrated into the sidebar of the full-screen `ImageViewer`.
   - Add an **"AI Suggested Keywords"** section below the manual keywords.
   
2. **Suggested Tag Interaction**
   - Markers for suggested tags appear as ghost/dashed badges.
   - **Actions:**
     - **Accept (Checkmark)**: Saves the keyword to the database and converts it to a standard keyword.
     - **Reject (X)**: Removes the suggestion and prevents it from reappearing for this image.
     - **Apply All**: Convenience button to accept all high-confidence suggestions.

3. **IPC Flow**
   - `window.electron.propagateTags({ imageId, k: 5, dryRun: true })`.
   - Returns a list of strings with confidence scores.

## Design Considerations

- **Visual Polish:** Suggested tags should have a subtle animation or distinct styling (e.g., italics, lower opacity) to indicate they are "pending" user approval.
- **Confidence Thresholding:** Only show suggestions with similarity > 0.85 to minimize noise.
