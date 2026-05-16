# Agent safety and hygiene — image-scoring-gallery

## Secrets

- Never commit real credentials in `config.json`, `.env`, or MCP configs. Use local overrides only.

## Renderer vs main process

- **Do not** add direct database or filesystem access from the **renderer** (React). Use **Electron main** (`electron/main.ts`), **preload** (`electron/preload.ts`), and **IPC** only. See [docs/CANONICAL_SOURCES.md](../docs/CANONICAL_SOURCES.md).

## Backend authority

- Do not invent REST endpoints, response fields, SQL columns, or phase names. Link to [image-scoring-backend API_CONTRACT](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md) and related canonical docs.

## RAW / NEF / EXIF / export

- Changes to in-browser RAW preview, NEF extraction, EXIF orientation, or JPEG export require **regression tests** (Vitest and/or main-process coverage). See [docs/CANONICAL_SOURCES.md](../docs/CANONICAL_SOURCES.md) RAW rows and [docs/features/implemented/05-jpeg-export-exif-orientation.md](../docs/features/implemented/05-jpeg-export-exif-orientation.md).

## Generated artifacts

- Do not commit `dist/`, `dist-electron/`, release bundles, debug zips, or personal path-based scratch files.

## Debug bundles

- Backend redacted bundles come from sibling repo `python scripts/export_debug_bundle.py`. Review before sharing; gallery does not replace that tool.

## MCP

- **execute_code** (when enabled on backend SSE) runs in the **WebUI process** — high risk on shared hosts. Prefer read-only gallery/backend MCP tools for triage.

## Git

- Never modify `.git/config` or add git extensions (see AGENTS.md).

## Docs

- Use relative links inside this repo; use **full GitHub URLs** to **image-scoring-backend** for schema/API authority.
- After wiki changes: update indexes per [docs/WIKI_SCHEMA.md](../docs/WIKI_SCHEMA.md) and append [docs/log.md](../docs/log.md).
