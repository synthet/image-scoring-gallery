# 06 - Smart Stack Representative (Frontend)

*Status: **Planned***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Allow users to configure whether stack covers display the highest-scoring image or the most "representative" image (the one closest to the stack's embedding centroid).

## UI Integration Points

1. **Settings View (`src/components/Settings/SelectionSettings.tsx`)**
   - Add a toggle: **"Use Smart Stack Covers (Centroid)"**.
   - This setting dictates which `image_id` the backend returns as the `cover_id` for stacks.

2. **Stack Rendering**
   - Display a "Target" icon badge on stack covers when chosen via centroid logic.
   - This provides transparency to the user why a lower-scoring image might be the cover.

## IPC / Configuration Flow

- **Setting**: Update `clustering.smart_cover_enabled` in `config.json`.
- **Effect**: Next time stacks are queried or rebuilt, the backend uses embedding proximity to choose the cover.

## Design Considerations

- **Hybrid Mode**: Optionally allow a "Best of Both" where it chooses the highest-scoring image within the 10% closest to the centroid.
