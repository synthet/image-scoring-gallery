---
type: "Planned Feature"
title: "Human culling labelling mode — blind pick/keep/reject with best frame and flip-compare loupe"
description: "Status: Planned (proposal, clean-room). In-app version of the local labelling tool behind the backend's human culling label set (#415)."
resource: "docs/features/planned/human-culling-labelling-mode.md"
tags: ["features", "gallery-docs", "planned", "culling", "labels", "evaluation", "clean-room"]
timestamp: 2026-09-25T00:00:00Z
---

# Human culling labelling mode

*Status: **Planned (proposal)** · Owner: TBD · Backend protocol:
[human culling label set](https://github.com/synthet/image-scoring-backend/blob/master/docs/planning/human-culling-labels.md)
(#415) · Motivation:
[reference culling shadow scores](https://github.com/synthet/image-scoring-backend/blob/master/docs/reports/reference-culling-shadow-scores-2026-09-25.md).*

## Provenance (clean-room)

Derived from competitive analysis of a commercial application's observable behaviour and documentation;
contains no code, identifiers, fitted constants or model artefacts from it. The labels are the owner's
own judgements.

## Why in the gallery

Every culling comparison in the backend so far measures agreement between models, because no independent
human labels exist. A first labelling set is being collected with a small local web tool (302 sampled
groups; 20 done on 2026-09-25, about 23 s per group). The gallery already has the viewer, zoom and
keyboard handling a culling workflow needs; a labelling mode here makes labels a by-product of normal
culling sessions instead of a separate chore.

## Behaviour

**Entry.** A "Label for evaluation" mode that walks the backend's sampled groups
(`human_labels.units`, in `sample_order`), resuming at the first group this labeller has not done.

**Blind by default.** While labelling, hide every model score, rank, badge, "best frame" star from the
pipeline, filename and stratum. Show frames in capture order. A labeller who has seen the model's pick is
no longer an independent label.

**Per group:**

| Action | Default key |
|---|---|
| Grade frame: pick / keep / reject | `P` / `K` / `X` (also `3` / `2` / `1`) |
| Best frame ("if you could keep only one"; also marks it pick) | `B` |
| Grade all ungraded frames keep / reject | `Shift+K` / `Shift+X` |
| Select previous / next frame | `←` / `→` |
| Loupe | `Space` or click |
| Save and next / skip (with optional note) | `Enter` / `S` |
| Previous / next group | `[` / `]` |

**Loupe.** Opens the full-resolution image (the RAW's embedded JPEG). A click zooms to 100 % at the
clicked point; drag pans. **Flip compare:** `←`/`→` inside the loupe switches frame while keeping the same
zoom and position, so eye sharpness can be compared at the same spot across the burst. Grading keys work
inside the loupe.

**Validation on save.** Every frame graded; at most one best frame; the best frame must be a pick; a group
may have no best frame only if every frame is rejected. Skipped groups need no grades.

**Persistence.** Save on every submit to `human_labels.labels` and `human_labels.unit_status` (labeller,
grade, best flag, note, seconds spent). Several labellers can label the same groups; labels are keyed by
labeller.

**Progress.** Done / skipped / total, and the next unlabelled group.

## Out of scope (for now)

- Showing model predictions after a group is saved ("how did the models do?"). Useful for motivation, but
  it risks biasing the next groups; revisit after the first evaluation.
- Writing these labels into `culling_picks` or XMP ratings. The backend protocol decides how labels reach
  the suitability toolkit.
- Drawing new samples from the gallery. Sampling stays a backend job so strata and weights stay
  consistent.

## Acceptance (starting point)

- A labeller can finish a 12-frame group with keyboard only.
- The loupe keeps the same image-relative position across frames at 100 %.
- Nothing on screen during labelling reveals a model score or pipeline pick.
- Labels written by the gallery are indistinguishable from those written by the local tool (same tables,
  same validation).
