# Development (gallery)

- **Run:** from repo root, `npm install`, then `npm run dev` (see [README.md](../README.md)).
- **Typecheck:** `npx tsc --noEmit` (renderer); `npx tsc -p electron/tsconfig.json --noEmit` (Electron) — see gallery **AGENTS.md** (known pre-existing errors may fail until cleaned up).
- **Health:** `npm run doctor` — Node version, `config.json`, sibling **image-scoring-backend** `webui.lock`.
- **Backend docs (sibling clone):** [image-scoring-backend docs/DEVELOPMENT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DEVELOPMENT.md) and [docs/DIAGNOSTICS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DIAGNOSTICS.md) for `python scripts/doctor.py`.

Keep **image-scoring-backend** and **image-scoring-gallery** as sibling directories unless you override API URL/port in `config.json`.
