---
name: agent-platform-tooling
description: >-
  Choose Windows native vs WSL2 for agent shell work. Gallery Electron/Node
  on Windows; sibling backend Python/GPU and Unix-path MCP in WSL2. Use when
  picking where to run installs, tests, or MCP servers.
---

# Agent platform tooling

Windows host vs WSL2 Ubuntu for coding agents in the gallery + backend workspace.

## Purpose

Pick the right environment before installing tools or running long jobs. Reduces path, performance, and line-ending issues.

## When to use

- Deciding where to clone or run commands
- Backend Python/pytest/GPU work vs gallery npm/Electron work
- MCP servers that expect Unix paths
- Docker Compose from backend repo

## Required tools

Platform-specific — see [windows-wsl-split.md](../agent-cli-hub/references/windows-wsl-split.md) and [install-blocks.md](../agent-cli-hub/references/install-blocks.md).

## Install

- **Windows:** winget block in [install-blocks.md](../agent-cli-hub/references/install-blocks.md)
- **WSL2:** apt + curl installers in same file

## Common commands

### Windows (gallery default)

```powershell
npm run dev
npm run doctor
rg "pattern" . --glob '!node_modules'
```

### WSL2 (backend default)

```bash
cd /mnt/d/Projects/image-scoring-backend
source ~/.venvs/tf/bin/activate
python scripts/doctor.py --no-gpu
```

### Switching context

See [windows-wsl-split.md](../agent-cli-hub/references/windows-wsl-split.md) for the full split diagram.

## When native Windows is enough

- Gallery search, edit, `git`, `gh`
- `npm run dev`, `npm run test:run`, ESLint, tsc
- Node with npm/pnpm/Corepack
- Simple `rg` / `fd` on `D:\Projects\...`

## When WSL2 is better

- **image-scoring-backend** scripts importing `modules.*`
- Pytest with `wsl` marker (`~/.venvs/image-scoring-tests`)
- Docker Compose workflows mirroring CI
- MCP servers expecting Linux paths
- Bash-heavy maintenance scripts

## Agent-safe patterns

- Store WSL clones under `~/src` when doing heavy I/O; use `/mnt/d/Projects` only when sharing with Windows tools.
- Do not run backend Python in Windows PowerShell with system Python — use WSL + documented venvs.
- Gallery Electron dev is routinely run on Windows; WSL X11/GUI is not required for typical workflows.

## Commands requiring confirmation

- Moving entire repo between Windows and WSL paths mid-task
- `wsl --unregister` or distro reset

## Troubleshooting

- **Slow rg on `/mnt/c`:** clone or sync to `~/src/image-scoring-gallery`.
- **Permission errors in WSL:** check file ownership after Windows edits.
- **Docker not reachable from WSL:** ensure Docker Desktop WSL integration enabled.

## Verification checklist

Windows:

```powershell
node --version; npm --version; Get-Command rg, git
```

WSL:

```bash
node --version 2>/dev/null; python3 --version; which rg fd git
```
