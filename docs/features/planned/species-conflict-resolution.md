# Single Bird Species per Image (BioCLIP top‑1)

*Status: **Planned (proposal)***

*Owner: TBD · Work lives almost entirely in **image-scoring-backend**; the gallery needs little to no change.*

## Decision

Assign **exactly one** `species:*` keyword per bird image — the **BioCLIP 2 argmax** (highest score/weight). No taxonomy normalization, no candidate re-scoring, no LLM/CLI-agent arbitration, no conflict-review UI. If the top score is below `threshold`, the image is marked `birds:species-exhausted` as today.

This supersedes the earlier multi-layer "conflict resolution via CLI agents" proposal (see *Rejected alternative* below). The tradeoff is accepted explicitly: images that genuinely contain two species (e.g. a Snowy **and** a Great Egret in frame) will get only the top‑scoring one. Simplicity wins.

## Goal

"Done" means:

1. New bird-species runs store **only the top‑1** `species:Common Name` keyword per image (was top‑3).
2. Existing images that already carry multiple `species:*` keywords are reconciled down to the single max‑weight one.
3. The gallery — which already renders and filters `species:*` keywords — needs no behavioral change; each bird image simply shows one species.

## How it works today (already built)

`image-scoring-backend/modules/bird_species.py` runs BioCLIP 2 zero‑shot over `birds`-tagged images and writes the top‑`top_k` species as `species:Name` keywords, each with a confidence stored on `image_keywords.confidence` (`source=bioclip`). `classify()` already returns results **sorted by confidence descending** and sliced to `top_k`. The default `top_k` is **3** at every layer. The backend's own tuning guide already lists "lower `top_k` to 1" as the fix for wrong-species noise (`docs/technical/BIRD_SPECIES_WALKTHROUGH.md:480`).

So the entire change is: **make `top_k = 1` the default**, plus a one-time backfill.

## Files / areas to touch (image-scoring-backend)

Change the default `top_k` from `3` → `1`:

- `modules/bird_species.py` — `BioCLIPClassifier.classify(..., top_k=3)`, `BirdSpeciesRunner.start_batch(..., top_k=3)`, and `_run_batch_internal(...)` signatures. (Internally `classify()` already does `sorted(... )[:top_k]`, so `top_k=1` = argmax. No logic change, just the default.)
- `modules/job_dispatcher.py:643` — `top_k=int(payload.get("top_k", 3))` → default `1`.
- API request model + `docs/reference/api/openapi.yaml` / `openapi.json` — `BirdSpeciesRequest.top_k` default `3` → `1` and example payloads.
- `modules/mcp_server.py` — `run_processing_job` bird_species default.
- Tests: `tests/` bird-species coverage + `tests/support/fake_runners.py:178` default.
- Docs: `docs/technical/BIRD_SPECIES_WALKTHROUGH.md` (`top_k` default references at lines ~81, 101, 277, 303).

Keep `top_k` an **overridable parameter** (don't hard-code 1) so a future run can request more candidates without a code change — only the *default* changes.

### Backfill existing multi-species images

Reconcile images that already have >1 `species:*` keyword down to the single max‑weight one. Two options:

- **A — SQL backfill (cheap, preferred):** for each image with >1 `species:*`, keep the keyword with the **max `image_keywords.confidence`**, drop the rest. Add a `scripts/db/backfill_single_species.py` mirroring the existing `scripts/db/backfill_keyword_relevance.py`. ⚠️ Only correct where confidence was persisted — older rows may have null/equal confidence; for those, fall back to option B or leave untouched and log.
- **B — Re-run with `overwrite=true`:** recomputes from the image and naturally writes one keyword. Authoritative but GPU-expensive; reuses the existing `BirdSpeciesRunner` skip-policy/batching. Good for the null-confidence remainder from option A.

## Files / areas to touch (image-scoring-gallery — this repo)

Likely **none functionally**. The gallery already partitions and renders `species:*` (`src/utils/keywordFilters.ts`, `electron/db.ts:528`, `ImageViewer.tsx`) and the `birds` species sub-filter keeps working with a single value. Optional polish only:

- The species sub-filter dropdown naturally shows one species per image now — no code change.
- If desired later, drop the now-rare multi-species handling, but it's harmless to leave.

## Approach (in order)

1. **Flip the default** `top_k` 3 → 1 across the backend layers above; update tests + OpenAPI + walkthrough docs. New runs immediately store one species.
2. **Backfill** existing data: SQL max-confidence reconcile (option A); optionally re-run the null-confidence remainder with `overwrite=true` (option B).
3. **Verify** in the gallery that bird images show a single species and the `birds` sub-filter is unaffected.

## Tests

Backend (`pytest`, mirror existing bird-species tests):
- `classify()` / runner with `top_k=1` writes exactly one `species:*` keyword.
- Sub-threshold max still yields `birds:species-exhausted` (unchanged).
- `top_k` override still honored when explicitly passed (e.g. `top_k=3`).
- Backfill: image with three `species:*` (confidences 0.7/0.2/0.1) → keeps only the 0.7 one; null-confidence ties left untouched + logged.

Gallery (this repo — `npx tsc --noEmit`, `npm test`):
- `src/utils/keywordFilters.test.ts` and `electron/db.getKeywordCloud.test.ts` stay green (species partitioning unchanged).

## Rollback / flags

- `top_k` stays a parameter; reverting the default to `3` restores prior behavior. No schema change.
- The backfill is the only irreversible step — **snapshot/back up** dropped `species:*` rows (or run on a copy first) since lower-scored candidates are deleted. Gate it behind a `--dry-run` that reports counts before mutating.

## Rejected alternative

The prior version of this doc proposed a four-layer pipeline (conflict detector → GBIF taxonomy → BioCLIP re-score → constrained CLI-agent arbitration → review UI) with a "both visible" outcome and an `image_species_resolution` table. **Rejected** in favor of BioCLIP top‑1 for simplicity. If multi-species frames or human-in-the-loop review become important later, that design is recoverable from git history.

## Related docs

- [technical/EMBEDDING_SPACES.md](../../technical/EMBEDDING_SPACES.md) — the `bioclip_2_image` (768‑d) space the bird-species phase persists as a side effect of classification.
- [CANONICAL_SOURCES.md](../../CANONICAL_SOURCES.md) — backend owns the BioCLIP runner, schema, and the `bird_species` phase; verify against backend docs before any DDL.
- Backend `docs/technical/BIRD_SPECIES_WALKTHROUGH.md` — the existing runner, `top_k`/`threshold` tuning, and job flow this plan adjusts.

## Open questions for the maintainer

1. **File on the board?** Per `CLAUDE.md`, this needs a `Ready` issue on [Project 1](https://github.com/users/synthet/projects/1) before implementation — and most of it lands in **image-scoring-backend**, so the issue likely belongs there.
2. Backfill strategy: SQL max-confidence (cheap, skips null-confidence rows) vs. full re-run (`overwrite=true`, GPU cost) vs. both?
3. Should the threshold change too? Top‑1 alone reduces noise; raising `threshold` (0.1 → 0.3) would further cut low-confidence single guesses.

---

*Planning document — no code changes made. Implementation should not begin until an issue is claimed on the board.*
