---
type: "Design Reference"
title: "UX/UI Design Visual Specification"
description: "This document outlines the visual design, user experience, and UI specifications for the Driftara Gallery (image-scoring-gallery) frontend application."
resource: "docs/design/FRONTEND_UX_SPEC.md"
tags: ["design", "gallery-docs"]
timestamp: 2026-06-16T00:00:00Z
---

# UX/UI Design Visual Specification

This document outlines the visual design, user experience, and UI specifications for the **Driftara Gallery** (`image-scoring-gallery`) frontend application.

**Palette and icons:** canonical contract in [image-scoring-ui `DESIGN_SYSTEM.md`](https://github.com/synthet/image-scoring-ui/blob/main/docs/DESIGN_SYSTEM.md) via `@synthet/image-scoring-design` **1.0.0**. Local pointer: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

### Stack differences (gallery vs backend `/ui/`)

| Aspect | Backend `/ui/` (`image-scoring-backend/frontend`) | Gallery (this repo) |
|--------|-----------------------------------------------------|---------------------|
| Framework utilities | Tailwind v4 (`@theme` from package `tailwind-theme.css`) | Vanilla CSS + **CSS Modules** (`.module.css`) |
| Token consumption | Theme utilities (`bg-bg-primary`, `text-text-secondary`, …) | `var(--color-…)` from `src/styles/tokens.css` |
| Design package CSS | `dist/tailwind-theme.css` | `dist/tokens.css` (imported into `tokens.css`) |
| Stage labels | `frontend/src/types/api.ts` (`STAGE_DISPLAY`) | `src/constants/pipelineLabels.ts` |
| `phase_code` authority | [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md) (backend) | Same doc; gallery mirrors labels only |

Other surfaces: Gradio operator UI at `/app` (backend) uses `gradio-snippet.css` from the same package — not used in the Electron app.

## 1. Overview and Design Language
The application is built using a modern desktop stack (Electron + React + Vite). The design language is strictly utilitarian, professional, and heavily inspired by developer tools like **VS Code Dark+**. The focus is on dense information display, high contrast for image viewing, and a distraction-free environment.

### Core Principles
- **Dark Mode First**: The application uses a dark color scheme exclusively to reduce eye strain and provide a neutral backdrop for viewing images and scores.
- **Information Density**: Padding and margins are kept relatively tight to maximize screen real estate for the gallery grid and sidebars.
- **Native Desktop Feel**: Utilizes native-feeling UI paradigms, such as a draggable top title bar, collapsible sidebars, and hierarchical tree navigation.

---

## 2. Color Palette
The color system is centrally managed via CSS custom properties in `src/styles/tokens.css`. It acts as the single source of truth for the gallery.

### Base Surfaces
The background colors form the structural layers of the application:
- **Primary Background (Gallery/Content)**: `#1e1e1e` (`--color-bg-primary`)
- **Secondary Background (Sidebar/Top Bar)**: `#252526` (`--color-bg-secondary`)
- **Tertiary Background**: `#2d2d30` (`--color-bg-tertiary`)
- **Elevated Surfaces (Modals/Popups)**: `#3c3c3c` (`--color-bg-elevated`)
- **Borders**: `#474747` (`--color-border`)

### Typography Colors
- **Primary Text**: `#cccccc` (`--color-text-primary`)
- **Secondary Text**: `#9d9d9d` (`--color-text-secondary`)
- **Muted Text**: `#6d6d6d` (`--color-text-muted`)

### Accents and Interaction
Blue is used as the primary interactive accent color, indicating focus, selection, or primary actions.
- **Accent Primary**: `#007acc` (`--color-accent`)
- **Accent Hover**: `#1e8ad6` (`--color-accent-hover`)
- **Accent Dim**: `#003f6e` (`--color-accent-dim`)
- **Focus Ring**: `2px solid var(--color-accent)` with a `2px` offset.

### Status and Semantics
Standard semantic colors are used for status indicators, badges, and validation:
- **Success**: `#89d185` (Border: `#2d6a2d`, BG: `#1a3320`)
- **Warning**: `#cca700` (BG: `#332900`)
- **Danger/Error**: `#f44747` (Border: `#7a2a2a`, BG: `#3a1515`)
- **Info**: `#9cdcfe` (BG: `#003a5c`)

### Photographic Labels (Lightroom-style)
Specific colors are reserved for image tagging and categorizations:
- **Red**: `#e53935`
- **Yellow**: `#fdd835`
- **Green**: `#43a047`
- **Blue**: `#1e88e5`
- **Purple**: `#8e24aa`
- **Gold (Score/Rating)**: `#ffd700`

---

## 3. Typography
The application uses system-native sans-serif fonts to integrate seamlessly with the user's OS while maintaining high legibility.

- **Font Family**: `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`
- **Line Height**: `1.5`
- **Font Weight**: `400` (Regular) as base

### Scale
- `--font-xs`: `0.75em`
- `--font-sm`: `0.8em`
- `--font-md`: `0.85em`
- `--font-base`: `0.9em`
- `--font-lg`: `1em`
- `--font-xl`: `1.1em`
- `--font-2xl`: `1.2em`

---

## 4. Spacing and Layout
Spacing is controlled by a predefined scale to maintain rhythm and consistency across components.

### Spacing Scale
- `--space-xs`: `4px`
- `--space-sm`: `6px`
- `--space-md`: `10px`
- `--space-lg`: `15px`
- `--space-xl`: `20px`

### Global Layout Architecture
Defined primarily in `src/styles/layout.css`, the application uses a fixed flexbox layout where scrolling is handled by internal containers rather than the document body.

- **App Container**: `100vw` x `100vh` flex container.
- **Top Bar**: Fixed `40px` height, acts as the drag region (`-webkit-app-region: drag`).
- **Sidebar**: Fixed width (`250px`), contains navigation, tree views, and filters.
- **Main Content Area**: Flex `1`, contains breadcrumbs and the primary content area (Gallery grid or Viewer).
- **Breadcrumbs Bar**: Scrollable horizontal bar showing current path/context.

---

## 5. CSS Architecture and Styling Paradigm
- **Vanilla CSS & Tokens**: The project relies on standard CSS rather than utility frameworks (like Tailwind) or CSS-in-JS libraries.
- **CSS Modules**: Component-specific styles are encapsulated using CSS Modules (e.g., `breadcrumbs.module.css`, `toggle.module.css`).
- **Global Variables**: All design tokens are exported to `:root` in `tokens.css` and are consumed globally via `var(--variable-name)`.
- **Component Specifics**:
  - `card-bg`: `#2a2a2a`
  - `input-bg`: `#333333`
  - `input-border`: `#555555`
  - `overlay-bg`: `rgba(0, 0, 0, 0.95)`

---

## 6. Key UI Components
The application is modularized into distinct functional areas within `src/components/`:
- **Gallery**: The primary grid view for browsing images.
- **Viewer**: A focused, full-size image viewing and scoring interface.
- **Sidebar & Tree**: Hierarchical navigation for the filesystem or logical groups.
- **Layout / Shared**: Reusable wrappers, top bars, and generic UI elements (buttons, toggles, inputs).
- **Settings / Sync / Runs**: Administrative and configuration panels.
