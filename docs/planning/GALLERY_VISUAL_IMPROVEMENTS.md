---
type: "Planning"
title: "Gallery visual improvements (implementation index)"
description: "Audit: reports/gallery-visual-review/2026-05-31.md"
resource: "docs/planning/GALLERY_VISUAL_IMPROVEMENTS.md"
tags: ["gallery-docs", "planning"]
timestamp: 2026-06-16T00:00:00Z
---

# Gallery visual improvements (implementation index)

**Audit:** [reports/gallery-visual-review/2026-05-31.md](../../reports/gallery-visual-review/2026-05-31.md)  
**Issue:** [synthet/image-scoring-gallery#123](https://github.com/synthet/image-scoring-gallery/issues/123)

## Design tokens (`@synthet/image-scoring-design` v1.1.1+)

| Token | Use |
|-------|-----|
| `--color-text-on-accent` | Filled accent controls (rating pills, primary buttons) |
| `--color-text-placeholder` | Date picker and input placeholders on dark surfaces |
| `--text-on-accent` / `--text-placeholder` | Gallery legacy aliases |

## Gallery changes

- Sidebar: `sidebarOpen` + `PanelLeft` toggle; collapse below 1100px ([layout.css](../../src/styles/layout.css))
- Filters: contrast in [FilterPanel.module.css](../../src/components/Sidebar/FilterPanel.module.css), [CalendarPicker.module.css](../../src/components/Sidebar/CalendarPicker.module.css)
- Empty filters: [GalleryGrid.tsx](../../src/components/Gallery/GalleryGrid.tsx) `filterEmptyActive`

## Backend `/ui`

- [GalleryPage.tsx](https://github.com/synthet/image-scoring-backend/blob/main/frontend/src/pages/GalleryPage.tsx) filter chips → CSS variables
- [GeoMapPage.tsx](https://github.com/synthet/image-scoring-backend/blob/main/frontend/src/pages/GeoMapPage.tsx) search button → `--color-text-on-accent`
