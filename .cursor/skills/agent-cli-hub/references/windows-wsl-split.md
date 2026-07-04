# Windows / WSL2 recommended split

## Windows host

Use for:

- VS Code / Cursor / Claude Desktop
- Docker Desktop
- **Driftara Gallery** Electron dev (`npm run dev`) — primary for this repo
- Simple search with `rg` / `fd` on Windows paths
- GitHub CLI (`gh`)
- Node with npm / pnpm / Corepack

## WSL2 Ubuntu

Use for:

- Sibling **image-scoring-backend** (Python, WSL venvs, GPU scripts)
- Docker Compose workflows that expect Linux paths
- MCP servers expecting Unix paths
- CI-like local test reproduction (backend pytest, WSL markers)
- Bash-heavy repos and tools with weaker native Windows support

## Gallery workspace layout

Keep **image-scoring-gallery** and **image-scoring-backend** as sibling directories (e.g. `D:\Projects\` on Windows, `/mnt/d/Projects/` in WSL when needed).

| Task | Prefer |
|------|--------|
| Gallery TS/React/Electron | Windows (or WSL — both work with npm) |
| Backend FastAPI / pytest `-m wsl` | WSL2 + `~/.venvs/tf` or `~/.venvs/image-scoring-tests` |
| PostgreSQL via Docker | Either; backend docs use `docker compose` from backend repo |

## Pitfalls

- **WSL2:** Keep active repos under `~/src` when possible — `/mnt/c` is slower for heavy I/O.
- **WSL2:** Debian/Ubuntu ship `fdfind`; symlink to `fd` (see [install-blocks.md](install-blocks.md)).
- **Windows:** Restart PowerShell after `winget` installs; verify PATH with `Get-Command rg,fd,git,jq`.
- Avoid editing the same repo simultaneously from Windows and WSL if line-ending or file-watcher issues appear.
