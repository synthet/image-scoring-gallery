---
description: RAW/NEF preview and JPEG export footguns — bake and EXIF-orientation reset are separate passes; regression-test export
paths:
  - "src/utils/export*"
  - "electron/nefExtractor*"
---

# Footguns: RAW preview and JPEG export

Distilled from [docs/LESSONS_LEARNED.md § RAW / NEF preview and JPEG export](../../docs/LESSONS_LEARNED.md#raw--nef-preview-and-jpeg-export-regression-sensitive).

- **Raster bake and EXIF-orientation reset are separate passes** — do not collapse them. Canonical: [docs/features/implemented/05-jpeg-export-exif-orientation.md](../../docs/features/implemented/05-jpeg-export-exif-orientation.md).
- **Upside-down exported JPEGs recur.** Any change to `src/utils/exportImageBake.ts` or main-process EXIF helpers needs a regression test (`exportImageBake*.test.ts`).
- **NEF/RAW preview fallback:** [docs/features/implemented/01-nef-raw-fallback.md](../../docs/features/implemented/01-nef-raw-fallback.md).
