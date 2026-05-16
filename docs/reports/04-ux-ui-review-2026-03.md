# UX/UI Review — Driftara Gallery (2026-03)

## Scope
This review covers the primary desktop workflow:
- folder selection and filtering in the left sidebar,
- gallery browsing and stack exploration,
- full-screen image viewing/editing.

The review is based on code-level UX inspection of current React/Electron components and follows heuristic criteria (clarity, consistency, efficiency, accessibility, and error prevention).

## What’s working well
1. **Strong information density without obvious visual clutter**: the grid card design, score overlays, and color labels support quick scanning for curation.
2. **Useful power-user shortcuts**: Escape navigation to parent contexts and left/right arrow navigation in the viewer improve speed for keyboard-driven usage.
3. **Clear stack concept in UI**: stacked card visual treatment and count badge make grouped images understandable at a glance.
4. **Good progressive disclosure**: EXIF and metadata loading is lazy/fallback-friendly, which protects perceived performance.

## Priority findings

### P1 — Discoverability and interaction affordance gaps
- **Issue**: Several interactive elements are visually styled but not semantically communicated as controls (e.g., breadcrumb segments rendered as `<span>` with click handlers).
- **User impact**: Low discoverability and weaker keyboard/screen-reader accessibility.
- **Recommendation**:
  - Convert clickable breadcrumb segments to `<button>` (or anchor-like controls) with focus states.
  - Add explicit labels for sidebar `<select>` controls (keyword/sort/order) instead of relying only on option text/context.

### P1 — Heavy inline styling reduces consistency and theming agility
- **Issue**: Major UI surfaces rely on extensive inline styles across gallery cards, side panel toggles, and context menus.
- **User impact**: Inconsistent hover/focus behavior and harder iteration on visual coherence.
- **Recommendation**:
  - Move repeated style patterns to CSS modules/tokens (card shells, toggles, action buttons, meta text).
  - Standardize spacing/typography scales for sidebar controls and card metadata.

### P1 — Toggle controls are custom but non-standard in behavior and semantics
- **Issue**: Stacks/Subfolders toggles are bespoke two-segment buttons (“OFF/ON”), but not exposed as switch controls.
- **User impact**: Ambiguity for assistive technologies and slightly higher cognitive load.
- **Recommendation**:
  - Replace with explicit switch/checkbox semantics (`role="switch"` + `aria-checked`, or native checkbox + label) while keeping current visual style.

### P2 — Error and destructive actions depend on browser dialogs
- **Issue**: Image metadata save/delete failures and delete confirmation use `alert()`/`confirm()`.
- **User impact**: Disruptive flow, inconsistent desktop feel, limited context in error recovery.
- **Recommendation**:
  - Route confirmations/errors through the existing in-app notification/modal pattern for consistency and richer action context.

### P2 — Global key handling may conflict in complex states
- **Issue**: Escape key is used in multiple contexts (viewer close, context menu close, parent navigation).
- **User impact**: Potential ambiguity in layered UI states as features grow.
- **Recommendation**:
  - Centralize keyboard handling with explicit priority order (modal > drawer > menu > page navigation).

## Quick wins (1–2 sprints)
1. Add visible labels and ARIA attributes to all sidebar filters and toggles.
2. Convert breadcrumb clickable spans into button elements with keyboard focus ring.
3. Replace `alert/confirm` with existing app modal/notification primitives.
4. Extract repeated inline styles in `GalleryGrid` and sidebar controls into shared classes/tokens.
5. Add a lightweight UX smoke checklist (keyboard-only flow + destructive action flow + no-results flow).

## Suggested success metrics
- **Task efficiency**: time-to-first-filtered-selection and time-to-delete-confirm-recover.
- **Input coverage**: percentage of gallery/viewer actions reachable via keyboard only.
- **Consistency**: reduction in unique inline style blocks for repeated control patterns.
- **Error recovery**: percentage of destructive/error events with in-app recoverable messaging.

## Referenced UI surfaces
- Sidebar filters/toggles and breadcrumbs in app shell.
- Virtualized gallery cards, context menu, and subfolder cards.
- Viewer editing/deletion/error interactions.
