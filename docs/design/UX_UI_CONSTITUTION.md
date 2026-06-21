---
type: "Design Reference"
title: "UX/UI Constitution — Gallery binding"
description: "Mandatory UX/UI rules for the Driftara Gallery Electron renderer — CSS Modules, design tokens, and agent checklist."
resource: "docs/design/UX_UI_CONSTITUTION.md"
tags: ["design", "gallery-docs", "constitution"]
timestamp: 2026-06-21T00:00:00Z
okf_version: 0.1
---

# UX/UI Constitution — Gallery binding

Mandatory UX/UI rules for **image-scoring-gallery** (Driftara Gallery Electron renderer). Shared principles and articles are **canonical** in [image-scoring-ui UX_UI_CONSTITUTION.md](https://github.com/synthet/image-scoring-ui/blob/main/docs/UX_UI_CONSTITUTION.md).

## Stack binding

- **Framework:** Electron + React 19 + Vite
- **Styling:** Vanilla CSS + **CSS Modules** (`.module.css`) — **no Tailwind**
- **Icons:** Lucide React (chrome); `EmbeddingSpaceIcon` from `@synthet/image-scoring-design` for embedding badges
- **Notifications:** `NotificationTray` + module CSS — severity via `--color-success|warning|danger|info`

## Token wiring

| Layer | Path |
|-------|------|
| Shared package CSS | `src/styles/tokens.css` → `@import '@synthet/image-scoring-design/tokens.css'` |
| Gallery-only layout/spacing | `src/styles/tokens.local.css` (`--space-*`, `--font-*`, `--sidebar-width`, `--card-bg`, …) |
| Global shell | `src/styles/layout.css`, `src/index.css` |
| Stage labels | `src/constants/pipelineLabels.ts` — re-exports package `STAGE_DISPLAY` |
| Embedding UI | Direct package imports (e.g. `SearchPage.tsx`) |

Palette tables: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (pointer) · [image-scoring-ui DESIGN_SYSTEM.md](https://github.com/synthet/image-scoring-ui/blob/main/docs/DESIGN_SYSTEM.md).

## Styling rules (gallery-specific)

1. **New or materially changed UI:** use a **CSS Module** — do not add new inline `style={{}}` blocks for layout or theme colors.
2. **Legacy inline styles:** when touching a file, migrate hardcoded colors to `var(--color-*)` where practical.
3. **Photo labels:** use `LABEL_COLORS` from the design package or `--label-*` CSS vars — not status semantic colors.
4. **Electron chrome:** top bar `-webkit-app-region: drag`; sidebar collapses below `1100px` (see [FRONTEND_UX_SPEC.md](FRONTEND_UX_SPEC.md)).
5. **Dialogs:** use in-app `ConfirmDialog` / notification tray — not browser `alert()` / `confirm()`.
6. **No new hex literals** in `src/` — extend `image-scoring-ui/src/tokens.json` and bump the package dependency.

## Out of scope

- Main-process DB/IPC — use **`gallery-electron-ts`** skill
- Backend `/ui/` SPA — use backend **`backend-frontend-ui`** skill
- Token source edits — use **image-scoring-ui** **`design-tokens`** skill

## Agent checklist

```bash
npm run design:check
npx tsc --noEmit
```

**Skill:** `.cursor/skills/gallery-ui/SKILL.md`

**See also:** [FRONTEND_UX_SPEC.md](FRONTEND_UX_SPEC.md) · [AGENT_COORDINATION §6](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md)
