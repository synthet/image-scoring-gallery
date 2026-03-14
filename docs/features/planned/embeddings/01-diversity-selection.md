# 01 - Diversity-Aware Selection (Frontend)

*Status: **Implemented***

*Part of [Embedding Applications - Frontend Implementation Index](README.md).*

## Goal

Expose the configuration controls for the backend's diversity-aware selection algorithm (MMR) within the Electron UI.

## UI Integration Points

1. **Settings View (`src/components/Settings/SelectionSettings.tsx`)**
   - **Status**: Fully Implemented.
   - Provides a section for "Selection & Diversity".
   - **Toggle**: "Diversity-Aware Selection" (maps to `selection.diversity_enabled`).
   - **Slider**: "Selection Weight (Lambda)" (maps to `selection.diversity_lambda`, range 0.0 - 1.0, step 0.05).
   - **Display**: Real-time visualization from "Broad Diversity" (0.0) to "Highest Quality" (1.0).

2. **IPC / Configuration Flow**
   - The React component calls `window.electron.setConfigValue(key, value)` to update settings.
   - The Electron main process writes these keys safely to the backend's `config.json`.

3. **Backend Trigger**
   - Diversity is applied during the `scoring` and `clustering` phases. When these jobs are triggered via `window.electron.runProcessingJob`, the backend reads the current lambda from config.

## Design Considerations

- **Tooltips:** Tooltips are implemented to explain that lower lambda favors diversity (different images) while higher lambda favors pure score (representative images).
- **User Experience:** The slider provides immediate visual feedback on the strategy being used.
