---
name: codebase-size-audit
description: >-
  Read-only scan for files ≥1000 LoC and functions/methods ≥150 LoC in this
  repo and sibling image-scoring-backend. Use for codebase size audit, large file
  scan, god-module review, or refactoring hotspot analysis.
---

# Codebase size audit (gallery)

Read-only. Uses the canonical script in sibling **image-scoring-backend**:

```bash
# From gallery root — typical sibling layout
python ../image-scoring-backend/scripts/audit/codebase_size_audit.py --root .

# Save report
python ../image-scoring-backend/scripts/audit/codebase_size_audit.py --root . -o .agent/scratch/audit-gallery.md
```

Full workflow, thresholds, and refactor guidance: **`../image-scoring-backend/.cursor/skills/codebase-size-audit/SKILL.md`**.

## Gallery hotspots (re-check after each audit)

- `electron/db.ts` — query monolith; defer without IPC contract plan.
- `ImageViewer.tsx`, `AppContent.tsx` — god components; extract hooks first.
- `electron/main.ts` — further IPC groups (`import:run`, `fs:*`, `nef:*`) can move to `electron/ipc/` like Batch 1.

Tests after extractions: `npm run test:run`, `npx tsc -p electron/tsconfig.json --noEmit`.
