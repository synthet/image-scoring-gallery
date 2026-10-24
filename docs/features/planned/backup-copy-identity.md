---
type: "Planned Feature"
title: "Backup copy identity — collision-safe destinations and verified repeat copies"
description: "Status: Planned (proposal, clean-room). Stop Backup from treating a camera filename or an equal byte size as proof that two photos are the same file."
resource: "docs/features/planned/backup-copy-identity.md"
tags: ["features", "gallery-docs", "planned", "backup", "export", "data-safety", "clean-room"]
timestamp: 2026-10-10T00:00:00Z
okf_version: 0.1
---

# Backup copy identity — collision-safe destinations and verified repeat copies

Backup must never lose a select because two different photos share a camera filename. It also must not
skip a copy because an unrelated file at the destination happens to have the same size.

*Status: **Planned (proposal)** · Priority: data safety · Owner: TBD · Spec of the current feature:
[backup-feature.md](../../architecture/backup-feature.md)*

## Provenance (clean-room)

The requirement shape comes from a competitive analysis of a commercial wildlife burst-culling
application's user-visible export behaviour and documentation. This page describes behaviour only: no
code, identifiers or constants from that product. The gaps below come from reading this repo's code.

## Problem

Camera filenames are not unique:
- frame counters wrap;
- two bodies of the same model produce the same names;
- photos from different card folders can share a name.

Backup plans destinations by name and confirms existing copies by size.

## Current state (code reading, not yet reproduced)

1. **Destination is name-derived with no collision handling.**
   [`backupPipeline.ts`](../../../electron/backupPipeline.ts) plans `camera/lens/year/date/<basename>`.
   `normalizeCameraModel` folds bodies of the same model together. Two different photos with the same
   basename, model, lens and date get the **same `destPath` and the same manifest key**.
2. **Copy overwrites.** [`registerBackupHandlers.ts`](../../../electron/ipc/registerBackupHandlers.ts)
   calls `fs.promises.copyFile(source, dest)` without an exclusive flag. Within one run, the second
   colliding photo replaces the first on disk and in the manifest.
3. **Skip-copy trusts size alone.** A destination file whose size equals the source's is treated as
   already backed up (`onDisk.size === p.sourceSize`), and the same rule applies to XMP sidecars. A
   different photo of equal size is silently not copied.
4. **Sidecar failures are invisible.** A failed XMP copy is caught and logged with `console.warn` only.
   The media row is recorded and the next run retries, but the user's result never reports it.
5. **A destination sidecar is deleted when the source has none.** When `sourceXmpSize === 0`, the copy
   loop unlinks the destination's `.xmp`. A sidecar that a catalogue wrote next to the backup copy (for
   example after importing the backup drive into Lightroom) is removed on the next run.

Items 1–3 can drop a select with no warning. Item 5 can destroy metadata we do not own. Item 4 hides
failures.

## Requirements

| # | Requirement |
|---|---|
| R1 | Two byte-different originals are never stored at one destination path. Both are kept. |
| R2 | An unchanged original that is already verified at the destination is not copied again. |
| R3 | The destination name actually used is persisted and survives the next run. |
| R4 | No write ever replaces an existing file that the plan did not verify as the same content. |
| R5 | Media and sidecar outcomes are recorded and reported separately. Retries never double-count. |
| R6 | Backup never deletes an XMP file that another application created. |

## Design (ours, built on the existing manifest)

- **Manifest as the source of truth.** Extend each manifest row with the source content hash and a
  `sidecarOwned` marker. A run reuses a row whose destination still exists and still verifies (R2, R3).
- **Verification.** When no row matches, look for an existing file at the planned path. Treat it as the
  same photo only when its size and content hash both match the source. Hash only after a size match to
  keep runs fast.
- **Naming.** Keep the camera filename when the path is free. Otherwise add a numbered suffix. The
  planner resolves names for the **whole plan before copying**, so two items in one run can never share a
  path (R1). Name comparison is case-insensitive on case-insensitive volumes (NTFS, exFAT).
- **Writing.** Copy exclusively (`COPYFILE_EXCL`, or a temp file plus an exclusive rename), so an
  unexpected existing file is reported instead of overwritten (R4).
- **Sidecars.** Record the sidecar result next to the media result. Surface "sidecar needs repair" in
  the backup result (R5). Unlink a destination `.xmp` only when `sidecarOwned` is set and its content
  still matches what was written (R6).

## Trust policy

- A camera filename, an equal size, or a previous manifest association alone never proves equality after
  the source or destination may have changed. Size + content hash does.
- The destination hash is computed from file bytes. Do not assume the DB `image_hash` is a byte hash (it
  carries a `hash_version`). Use it only if its definition is confirmed to be full-file bytes.
- Prebuild rows (`id: 0`) keep their current protections. Collision handling never unlinks them.

## Non-goals

- Changing selection, dedup, MMR or space budgeting.
- Renaming files that are already on the destination.
- Compressed archive output.

## Acceptance

Owned fixtures plus fault injection, as unit tests next to the existing backup tests:

- Two byte-different photos, same basename, model, lens and date → both present after one run, one with
  a numbered suffix; manifest has two rows.
- A different photo of equal size already at the destination → copied under a suffixed name, not skipped.
- An unchanged repeat run → zero copies, zero new suffixes.
- Destination copy deleted or modified since the last run → re-copied, with the manifest updated.
- Source changed since the last run → treated as a new copy, not adopted.
- Sidecar write fails after the media copy → media counted as copied, warning reported, retry fixes the
  sidecar only.
- Source has no sidecar, destination has a foreign `.xmp` → destination sidecar left intact.
- Interruption between copy and manifest checkpoint → next run adopts the file by content match; no
  duplicate.

## Related

- Current feature spec: [backup-feature.md](../../architecture/backup-feature.md)
- Built on top of this: [archive picks](archive-picks.md)
