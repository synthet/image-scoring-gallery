# 06 - Smart Stack Representative (Frontend)

*Status: **In Progress (Preference + request threading scaffolded on March 28, 2026)***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Allow users to configure whether stack covers display the highest-scoring image or a future "representative" image (e.g., nearest stack centroid).

## Current Implementation Phase

The UI + request threading scaffolding is in place:

1. **Settings UI component**: `src/components/Settings/SelectionSettings.tsx`.
2. **Persisted config key**: `selection.smartCoverEnabled` (saved via existing config bridge).
3. **Stack request threading**:
   - `smartCover` is now included in stack query options.
   - rebuild calls now pass context `{ smartCover }` through bridge/preload/main/server layers.

> Note: Stack representative selection logic is still backend-driven and not yet implemented in SQL/embedding logic.

## UI Integration Points

1. **Settings Modal Integration**
   - `SettingsModal.tsx` now renders `SelectionSettings` and updates selection preferences.

2. **Stack Rendering Behavior (Current)**
   - Existing visual stack rendering remains unchanged.
   - Smart Cover currently affects request context only.

## IPC / Configuration Flow

- **Setting key**: `selection.smartCoverEnabled` in saved app config.
- **Runtime behavior**: value is loaded into `AppContent` and passed into stack fetch/rebuild calls.
- **Future backend effect**: stack cover selection should switch to representative image when enabled.

## Next Steps

1. Implement backend representative-image selection strategy.
2. Surface representative-selection indicators on stack cards.
3. Add test coverage verifying request context propagation and config persistence.
