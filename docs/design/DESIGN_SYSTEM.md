---
type: "Design Reference"
title: "Design system — gallery pointer"
description: "Canonical doc: image-scoring-ui docs/DESIGNSYSTEM.md (sibling clone: ../image-scoring-ui/docs/DESIGNSYSTEM.md)."
resource: "docs/design/DESIGN_SYSTEM.md"
tags: ["design", "gallery-docs"]
timestamp: 2026-06-16T00:00:00Z
---

# Design system — gallery pointer

**Canonical doc:** [image-scoring-ui `docs/DESIGN_SYSTEM.md`](https://github.com/synthet/image-scoring-ui/blob/main/docs/DESIGN_SYSTEM.md) (sibling clone: [`../image-scoring-ui/docs/DESIGN_SYSTEM.md`](../../image-scoring-ui/docs/DESIGN_SYSTEM.md)).

**Shared package:** [`@synthet/image-scoring-design`](https://github.com/synthet/image-scoring-ui) **1.2.x** — installed from `package.json` (`github:synthet/image-scoring-ui#v1.2.x`). Rebuild the UI package (`npm run build` in **image-scoring-ui**) after editing `src/tokens.json`.

## What lives in this repo

- **[UX_UI_CONSTITUTION.md](UX_UI_CONSTITUTION.md)** — Mandatory gallery binding (shared principles in [image-scoring-ui](https://github.com/synthet/image-scoring-ui/blob/main/docs/UX_UI_CONSTITUTION.md)).
- **[FRONTEND_UX_SPEC.md](FRONTEND_UX_SPEC.md)** — Gallery layout, typography, and CSS Modules conventions (stack differences vs backend Tailwind: see that doc).
- **`src/styles/tokens.css`** — Generated or synced from the design package; layout-only rules in `src/styles/layout.css`.
- **Severity toasts** — [`src/components/Layout/NotificationTray.tsx`](../../src/components/Layout/NotificationTray.tsx) (`Info` / `CheckCircle2` / `AlertTriangle` / `XCircle`).

**See also:** [Canonical sources](../CANONICAL_SOURCES.md) · [Pipeline terminology](../technical/PIPELINE_TERMINOLOGY.md)
