---
type: Lessons Learned
title: Lessons Learned — image-scoring-gallery
description: Gallery-specific traps and workflows — Sync/import correctness, IPC boundaries, RAW/EXIF export, backend connectivity, species resolution.
resource: docs/LESSONS_LEARNED.md
tags: [lessons, agent, electron, ipc, sync, raw-export, okf]
timestamp: 2026-06-16T00:00:00Z
okf_version: 0.1
---

# Lessons Learned — image-scoring-gallery

Hard-won lessons distilled from agent session history (Claude Code + Cursor).
Complements `CLAUDE.md`, `AGENTS.md`, and the canonical docs. This is the "why it
bit us" narrative; promote anything durable into the canonical reference and link
back.

**Authority:** backend schema/API remain in
[sibling image-scoring-backend](https://github.com/synthet/image-scoring-backend);
this page captures **gallery-specific** traps and workflows only.

## Sync / import correctness

### The below-threshold quick-skip bug (the big one)
**Symptom:** a Sync run imported only a couple of dates; hundreds of files on the
card were never imported and became *permanently invisible* to future syncs.

**Root cause:** the below-threshold "quick-skip" fast path in
`electron/main.ts` (`runSyncFromSource`) treated *file-exists-on-disk* as
"already synced" and `return`ed without ever checking the DB. If a prior run had
copied the file but crashed before importing it (tell-tale leftover:
`...NEF_exiftool_tmp`), the file was on disk, below the threshold, and skipped
forever.

**Fix / rule:** any "already done, skip it" fast path that keys on **filesystem
presence must also confirm the DB row exists** (`db.findImageByFilePath`) before
skipping. Disk presence ≠ indexed. The normal (non-fast) path already did this;
the fast path was the hole.

**Generalize:** when you add an optimization that short-circuits work, make sure
the short-circuit condition is the *full* success condition, not a cheap proxy
for it.

### Nikon camera-original NEFs have no embedded UUID
Camera-original `.NEF` files carry **no** `ImageUniqueID` / `DocumentID`. The DB's
`image_uuid` GUIDs are **generated at import time**. Consequences:
- Sync dedupes these files by **destination path only**.
- Card→DB verification must key on **(EXIF capture date + filename)**, never UUID.
- The `-fast2` exiftool flag was *not* hiding the UUIDs — they genuinely don't
  exist. Don't chase a flag artifact that isn't there.

### Don't re-import tombstoned files
The `deleted_images` tombstone table (viewable at
`http://localhost:7860/ui/db/deleted_images`) records intentionally culled
images. Sync must either skip files matching a tombstone or de-duplicate against
it (by `image_uuid` / `image_hash` / `file_name` / `original_path`) — otherwise
deleted images resurrect on the next sync.

### Verification at scale: index once, match in memory
Classifying 63 "missing" files by running 63 separate
`Get-ChildItem 'D:\Photos' -Recurse` calls over a 60k-file tree was hopelessly
slow (and produced empty background output). The right shape: **one** recursive
scan that builds a `Map<date+filename → path>` and a `Set` of tombstoned names,
then classify all candidates in memory.

## Environment & tooling traps

### Postgres stores WSL-style paths
Paths live in Postgres as `/mnt/d/Photos/...`. Normalize via `normalizePathForDb`
before querying; don't compare raw `D:\...` strings against stored values.

### Postgres POSIX regex has no `\d`
`substring(file_path from '\d{4}-\d{2}-\d{2}')` silently returns NULL. Use
`[0-9]{4}-[0-9]{2}-[0-9]{2}`.

### Bash quoted heredocs still mangle backslashes
Even `<<'EOF'` (quoted heredoc) collapsed `\\` → `\`, so `f.split('\\')` became
`f.split('\')` — a `SyntaxError`. **Fix:** create `.mjs`/script files with the
Write tool and use `path.basename()` / `path.join()` instead of hand-rolled
backslash splits. This recurred more than once — reach for the Write tool, not a
heredoc, whenever the payload contains backslashes.

### Don't nest PowerShell inside node one-liners
A combined PowerShell-in-node script returned 0 results because of nested
quoting. Do disk counts with the PowerShell tool and DB counts with node/`pg`
**separately**, then reconcile.

## Architecture boundaries (reaffirmed)

- **DB and filesystem access belong in the Electron main process** via
  IPC/preload. Never add renderer-process DB access.
- The **backend owns the REST API and schema authority**. The gallery consumes
  it; it does not define columns or endpoints. Discover the backend via
  `webui.lock` (fallback port `7860`).
- `electron/db.ts` functions are exported and standalone-importable (no electron
  import) so recovery scripts under `.agent/tmp/` can reuse them via `npx tsx`.

## Species / keyword resolution (design lesson)

When an image has multiple `species:*` keywords (e.g. `Snowy Egret` +
`Great Egret`), do **not** auto-pick a "truth":
- Treat existing keywords as **candidates**; resolve into *new* fields/tables
  (`candidate_species`, `resolved_species`, `needs_review`) rather than
  overwriting keywords.
- Use **BioCLIP 2** (max score/weight) as the local visual scorer constrained to
  the candidate set — not a generic vision LLM asked "what species is this?"
  (those hallucinate and miss scale cues).
- Normalize names via GBIF/eBird taxonomy; support a "both visible" outcome
  (bird photos legitimately contain multiple similar egrets).
- The resolver belongs in the **backend** (a species-resolution service), exposed
  over the API — not as renderer DB writes.

See `docs/features/planned/species-conflict-resolution.md`.

## Backend connectivity (Cursor-mined)

- Resolve the FastAPI URL via the sibling **`webui.lock`**; `config.api.url` /
  `config.api.port` in `config.json` override lock discovery.
- When the API status indicator stays red, check WebUI reachability and
  `database.engine` (`pg` vs `api`) **before** debugging renderer code.
- Cross-repo contract changes need coordinated PRs — see backend
  [`docs/technical/AGENT_COORDINATION.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md).

## RAW / NEF preview and JPEG export (regression-sensitive)

- **NEF/RAW preview:** see
  [`features/implemented/01-nef-raw-fallback.md`](features/implemented/01-nef-raw-fallback.md).
- **JPEG export / EXIF orientation:** raster bake and EXIF-orientation reset are
  **separate passes** — do not collapse them. Canonical doc:
  [`features/implemented/05-jpeg-export-exif-orientation.md`](features/implemented/05-jpeg-export-exif-orientation.md).
- Upside-down exported JPEGs were a recurring transcript theme; always
  regression-test export after touching `src/utils/exportImageBake.ts` or
  main-process EXIF helpers.

## MCP and debugging (Cursor-mined)

- Default agent surface: **`is-ui-mcp`** — Node stdio at `mcp-server/dist/compactIndex.js`; tools **`search`**, **`dispatch`**, **`sse_status`**.
- Backend pipeline triage: sibling **`is-be-mcp`** with the same compact contract (Python worker via WSL on Windows).
- Optional SSE attach: **`is-ui-live`** / **`is-be-live`** only while Electron/WebUI is running; stdio proxies when up, graceful errors when down.
- Guide: [guides/05-mcp-compact-servers.md](guides/05-mcp-compact-servers.md). Prefer MCP read-only probes before ad-hoc SQL from the renderer.

## Docs and releases (Cursor-mined)

- Doc changes: OKF frontmatter + `/wiki-ingest`; append [`log.md`](log.md).
- Releases: `/release-notes` then `/release`; keep `CHANGELOG.md` aligned.
- Regenerate API types when backend OpenAPI changes: `npm run generate:api-types`.

## Cross-repo: pipeline input-size study

Monitor backend epic
[#260](https://github.com/synthet/image-scoring-backend/issues/260) and gallery
follow-up [#138](https://github.com/synthet/image-scoring-gallery/issues/138).
Keep [`reports/07-pipeline-input-size-study-2026-05.md`](reports/07-pipeline-input-size-study-2026-05.md)
current and the link from
[`features/implemented/06-culling-stack-analytics.md`](features/implemented/06-culling-stack-analytics.md)
accurate. Do not invent schema or bump `MAX_SIZE` before backend sign-off.

## Recurring transcript themes (2026 mining)

| Theme | Frequency | Notes |
|-------|-----------|-------|
| IPC / preview / sync | High | Broken preview often traces to path or thumbnail pipeline |
| RAW export / EXIF | Medium | See feature doc § regression |
| Postgres migration | Medium | Firebird decommissioned; use `pg` or `api` engine only |
| MCP consolidation | Low | Single compact `is-ui-mcp` entrypoint |
| Release / changelog | Medium | Multi-repo release sessions common |

## Related

- [`.cursor/skills/gallery-electron-ts/SKILL.md`](../.cursor/skills/gallery-electron-ts/SKILL.md)
- [`.agent/PROJECT_GUIDE.md`](../.agent/PROJECT_GUIDE.md)
