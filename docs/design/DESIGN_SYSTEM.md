# Design system — gallery mirror

The full design-system contract (palette, status mapping, Lucide icon
contract, sizing rules, photo-label palette) is **canonical in
image-scoring-backend** and applies to this repo unchanged.

> **Read the canonical doc:** [image-scoring-backend / docs / design / DESIGN_SYSTEM.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/design/DESIGN_SYSTEM.md)

## What lives in this repo

| Concern | File |
|---|---|
| Token definitions | [`src/styles/tokens.css`](../../src/styles/tokens.css) — surfaces, text, accent, status (`--color-success/warning/danger/info`), accents, photo labels (`--label-*`), score gold (`--score-gold`) |
| Layout-only CSS | [`src/styles/layout.css`](../../src/styles/layout.css) — sidebar width, top bar, breadcrumbs, content area; no longer redefines color tokens |
| Severity toasts | [`src/components/Layout/NotificationTray.tsx`](../../src/components/Layout/NotificationTray.tsx) (`Info` / `CheckCircle2` / `AlertTriangle` / `XCircle`) |
| Photo labels (rendering) | [`src/components/Sidebar/FilterPanel.tsx`](../../src/components/Sidebar/FilterPanel.tsx), [`src/components/Gallery/GalleryGrid.tsx`](../../src/components/Gallery/GalleryGrid.tsx), [`src/components/Viewer/ImageViewer.tsx`](../../src/components/Viewer/ImageViewer.tsx) — all read from `--label-*` |
| Score gold | `--score-gold` in `tokens.css`; consumed by `GalleryGrid.module.css` (`.ratingStars`) and `ImageViewer.tsx` |

## Local conventions

- All colors come from `var(--…)`. New hex literals in `.tsx` / `.module.css`
  are a smell — propose a token in `tokens.css` first.
- Lucide icons follow the canonical contract. Notable consequences in this
  repo:
  - DB-connection error in [`src/App.tsx`](../../src/App.tsx) uses `XCircle` (error, not `AlertCircle`).
  - RAW preview hint in [`src/components/Gallery/GalleryGrid.tsx`](../../src/components/Gallery/GalleryGrid.tsx) uses `AlertTriangle` (warning).
- Run-status visuals (Loader / CheckCircle2 / XCircle / AlertTriangle / etc.)
  align with [`PhaseStatusIcon.tsx` in the backend frontend](https://github.com/synthet/image-scoring-backend/blob/main/frontend/src/components/status/PhaseStatusIcon.tsx).

**See also:** [Canonical sources](../CANONICAL_SOURCES.md) · [Documentation index](../README.md)
