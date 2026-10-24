---
type: "Planned Feature"
title: "Archive picks — copy a shoot's selects to the archive in one action"
description: "Status: Planned (proposal, clean-room). Copy the picked originals of one folder, with sidecars, to an archive root in one confirmed action that never changes regular backup settings."
resource: "docs/features/planned/archive-picks.md"
tags: ["features", "gallery-docs", "planned", "backup", "export", "culling", "clean-room"]
timestamp: 2026-10-10T00:00:00Z
okf_version: 0.1
---

# Archive picks — copy a shoot's selects to the archive in one action

After culling a shoot, the user hands the picks to an archive or a catalogue (for example Lightroom) in
one action, without re-checking export options.

*Status: **Planned (proposal)** · Owner: TBD · Depends on
[backup copy identity](backup-copy-identity.md) · Builds on
[backup-feature.md](../../architecture/backup-feature.md)*

## Provenance (clean-room)

This workflow idea comes from a competitive analysis of a commercial wildlife burst-culling application's
user-visible behaviour and documentation. This page describes behaviour only. The folder layout, naming
and options are our own and do not reproduce that product's.

## Problem

Backup is designed as a library-wide, score-filtered mirror with dedup and space budgeting. There is no
short path for the common end-of-shoot step: "copy exactly what I picked in this folder to my archive,
with sidecars, and show me the destination".

## Behaviour

| Aspect | Behaviour |
|---|---|
| Input | Curated picks (`is_pick`) of the current folder, or of the current selection when one exists |
| Destination | An archive root chosen once and remembered, plus a dated shoot folder. The default template reuses Backup's own `camera/lens/year/date` convention. A configurable template (tokens: year, date, folder name, camera, lens) is an option. |
| Date | From the **earliest usable capture date among the picks**. If no pick has a usable capture date, **refuse** with a clear message. Never fall back to today's date. |
| Content | Full-resolution **copies** of the originals (never a move), original camera filenames, each copy accompanied by its XMP sidecar |
| Collisions | As in [backup copy identity](backup-copy-identity.md): keep the camera name, suffix only for a real collision, skip verified repeats |
| Options | Fixed for this action: no score floor, no dedup, no MMR, no space rotation, no pruning. Archiving picks **does not change** saved Backup settings. |
| Confirmation | Before writing, show the resolved destination path(s), the photo count, and the physical file count (media + sidecars), counted separately. Confirming approves exactly that plan. |
| Result | Per-photo outcome against the plan: copied / already present / failed, with media and sidecar reported separately |

## Implementation sketch

Run it as a **scoped Backup run** rather than a new copy pipeline:
- the plan source is "picks of folder X" instead of `getAllScoredImagesForBackup`;
- selection and space stages are bypassed;
- the existing copy, manifest and checkpoint path is reused.

The manifest lives under the archive root like a Backup target, so repeating the action is idempotent.

## Non-goals

- Moving or deleting originals.
- Compressed (zip) delivery.
- Choosing picks automatically. The action copies only the user's picks.

## Acceptance (starting point)

- Picks spanning two capture dates → one destination dated by the earliest valid date; the confirmation
  shows it.
- No pick has a usable capture date → refused; nothing written.
- Archiving an unchanged folder again → zero copies.
- Collision with a different file of the same name → both kept.
- Saved Backup settings are byte-identical before and after an archive run.
- Cancel at confirmation → nothing written.

## Open questions

- Sidecar naming: keep the source's sidecar style only, or also write the other common style
  (`NAME.xmp` vs `NAME.EXT.xmp`) for catalogue compatibility?
- Should a successful archive run also set a per-folder "exported N picks" badge in the folder tree? This
  needs a small persistent export-history record.
