---
type: "Planned Feature"
title: "Learn scoring weights from the user's own choices, and shooting-style presets"
description: "Status: Planned (proposal). Fit personal criterion weights from culling labels and quick A/B prompts, and offer presets named by shooting style in score tuning."
resource: "docs/features/planned/learn-weights-from-choices.md"
tags: ["features", "gallery-docs", "planned", "culling", "scoring", "clean-room"]
timestamp: 2026-10-10T00:00:00Z
okf_version: 0.1
---

# Learn scoring weights from the user's own choices, and shooting-style presets

Turn the user's own "this frame beats that one" decisions into a personal weight preset for score
tuning. Also offer presets named by shooting style instead of raw sliders.

*Status: **Planned (proposal)** · Owner: TBD · Extends
[burst culling explainability §3 (score tuning)](burst-culling-explainability.md#3-adjust-scoring-client-side-re-derivation)
· Label source: [human culling labelling mode](human-culling-labelling-mode.md) (backend #415)*

## Provenance

The general idea (personalising weights from a user's choices) comes from a competitive analysis of a
commercial wildlife burst-culling application's user-visible behaviour. This page describes behaviour
only: no code, constants, preset values, UI labels or identifiers from that product.
- The fitting and sampling methods are standard statistics, chosen by us.
- Preset names use common photography vocabulary.
- All numbers are ours to fit.

## Problem

The score-tuning panel (explainability §3) gives four presets and six sliders. Users do not know which slider
encodes their taste. Meanwhile the labelling mode collects exactly the within-burst choices that reveal
it.

## Part 1 — Learn weights

1. **Pair sources.**
   - **Implied pairs from culling labels.** Within one labelled group, the hero frame beats every other
     frame, and a pick beats a second or a reject. Only frames of the same burst are paired.
   - **Quick A/B prompt** (optional). Show two frames from one burst. Answers: *left*, *right*, or *can't
     tell*. "Can't tell" is stored but left out of the first version's fit.
2. **Which pairs to ask.** Use standard uncertainty sampling: ask the pairs the current model is least
   sure about (predicted win probability nearest even). Skip pairs it already predicts confidently.
3. **Model.** Bradley–Terry on the six sub-scores: P(a beats b) = σ(Σ wᵢ·(aᵢ − bᵢ)).
   - Parametrise the weights through a softmax, so they stay positive and sum to 1 by construction.
   - Put a Gaussian prior in that parameter space, centred on the current preset (MAP estimate).
   - Choose the prior strength by held-out agreement, not by a fixed constant.
   - Standardise the sub-score differences before fitting.
4. **Report before saving.**
   - Show learned vs current weights.
   - Show **held-out agreement** (pairs not used in the fit) for both weight sets on the same pairs.
   - Offer to save as a named custom preset only when the learned weights do better.
5. **Scope.** Fitting is six weights on stored sub-scores. It runs in the renderer next to the score-tuning
   recompute, with no inference and no backend write.

## Part 2 — Shooting-style presets

Add presets named by how the photographer shoots. Each sets several score-tuning controls at once. The
set and every value are ours, to be confirmed against #415 failure clusters before shipping:

| Preset | Intent |
|---|---|
| Default | Current defaults |
| Animalscape | Subject small in a wide scene; reward the scene, soften subject-size demotion |
| Behaviour & action | Back-turned and head-down poses are acceptable; relax eye requirements |
| Creative / abstract | Motion pans, silhouettes, partial subjects; do not cap frames without a detected subject |
| Dawn & dusk | Accept more high-ISO grain before penalising noise |
| Tight cull | Demand a detected subject, eye contact and critical focus |

One compact control replaces raw modifier editing: **Eye contact** — *required / preferred / not
required*. It maps onto the existing eye and head modifiers. A combination that matches no preset is
shown as *Custom*.

## Constraints

- Never writes backend scores. Only the local tuning profile changes (explainability §3 invariant).
- Learned presets record the evidence weights-version they were fitted on. When that version changes,
  mark them *stale* instead of applying them silently.
- Labelling-mode blindness is unaffected: fitting happens after labels are saved and never shows model
  scores during labelling.

## Acceptance (starting point)

- On a fixture of labelled groups, the fit is deterministic (fixed seed and split), and held-out
  agreement is reported.
- With few answers, the weights stay near the starting preset (prior dominates).
- Learned weights are positive and sum to 1 (by construction; asserted in tests).
- Presets round-trip: selecting one, then reading the controls, reproduces the preset; editing a control
  shows *Custom*.
- A weights-version change marks learned presets stale.

## Open questions

- Should learned presets sync to the backend, so mobile and the pipeline can rank with them? That would
  move ownership of the profile to the backend.
- Minimum answer count before offering a fit; decide from #415 labels.
