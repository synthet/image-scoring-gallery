---
description: Debug RAW/NEF preview — regression-sensitive paths
---

## Purpose

Guide investigation of **in-browser RAW**, **NEF extraction**, and **orientation** issues without silent behavior drift.

## When to use

- Thumbnails wrong orientation; NEF fails to load; export JPEG rotation bugs.

## Canonical docs first

- [docs/CANONICAL_SOURCES.md](../../docs/CANONICAL_SOURCES.md) — RAW rows (link to **backend** technical RAW docs via GitHub)
- [features/implemented/05-jpeg-export-exif-orientation.md](../../docs/features/implemented/05-jpeg-export-exif-orientation.md)
- Backend: [RAW_PROCESSING_GUIDE](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/RAW_PROCESSING_GUIDE.md), [NEF_IMPLEMENTATION_REVIEW](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/NEF_IMPLEMENTATION_REVIEW.md)

## Safe process

1. Capture **one** repro file path and **expected vs actual** orientation/preview.
2. Trace IPC: renderer → preload → main (`electron/nefExtractor.ts`, `electron/main.ts`, related `src/`).
3. **Any behavior change** — add or extend **Vitest** (and main-process coverage if applicable); document in PR.

## Common failure modes

- Double application of EXIF orientation (renderer + export).
- Missing regression test after EXIF flag change.

## Do not

- Do not change orientation or RAW handling without tests.
- Do not bypass IPC with renderer-side file reads.
