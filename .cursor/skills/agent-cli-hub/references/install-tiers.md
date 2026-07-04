# Install tiers

Tiered install order for **image-scoring-gallery** agent CLI skills. Block A commands live in [install-blocks.md](install-blocks.md) — do not duplicate full winget blocks here.

## Tier overview

| Tier | What | When to install |
|------|------|-----------------|
| **Tier 0 (router core)** | `git`, `rg`, `fd`, `jq`, `node` | First — hub and most skills assume these |
| **Block A (canonical)** | Full block in [install-blocks.md](install-blocks.md) | Core agent workflow on your platform |
| **Block B (extensions)** | Child-skill tools not in Block A | Recommended full agent workflow |
| **Deferred** | Optional per skill | Only when that skill's task needs them |

## Install scopes (operator choice)

| Scope | Includes |
|-------|----------|
| **Core only** | Tier 0 + any missing Block A tools from install-blocks |
| **Recommended** | Block A + Block B |
| **Everything missing** | Recommended + deferred tools you expect to use |

After any winget/uv/npm install, see [agent-environment.md](agent-environment.md) — restart Cursor and smoke-test PATH.

## Tier 0 — router core

Must respond to `--version` before other skills:

```powershell
git --version; rg --version; fd --version; jq --version; node --version
```

Install missing tools via Block A in [install-blocks.md](install-blocks.md).

## Block A — canonical (install-blocks.md)

Tools in the Windows winget / WSL apt / Homebrew blocks:

- `git`, `gh`, `rg`, `fd`, `jq`, `delta`, `bat`, `zoxide`, `node` (+ npm/corepack)
- `ast-grep` (`sg` via npm global)
- `uv`, `ruff`, `pyright` (optional for sibling backend work)

**Note:** Prefer standalone winget `rg` on Windows even if Cursor bundles its own ripgrep for IDE search.

## Block B — child-skill extensions

Not listed in Block A install-blocks; install when pursuing **Recommended** scope.

| Tool | Child skill | Windows (winget) |
|------|-------------|------------------|
| `yq` | [agent-data-config](../../agent-data-config/SKILL.md) | `MikeFarah.yq` |
| `just` | [agent-dev-tooling](../../agent-dev-tooling/SKILL.md) | `casey.just` |
| `mise` | agent-dev-tooling | `jdx.mise` |
| `direnv` | agent-dev-tooling | `direnv.direnv` |
| `eza` | [agent-search](../../agent-search/SKILL.md) | `eza-community.eza` |
| `shellcheck` | agent-dev-tooling | `koalaman.shellcheck` |
| `trivy` | agent-dev-tooling | `AquaSecurity.Trivy` |
| `hadolint` | agent-dev-tooling | `hadolint.hadolint` |

WSL/macOS: many Block B tools are in the Homebrew one-liner in install-blocks; on WSL apt, install individually or via brew/linuxbrew when needed.

### Block B — one-shot Windows example

```powershell
winget install MikeFarah.yq casey.just jdx.mise direnv.direnv eza-community.eza koalaman.shellcheck AquaSecurity.Trivy hadolint.hadolint
```

Confirm IDs with `winget search` on locked-down machines.

## Deferred — optional

Install only when the linked skill's task requires it:

| Tool | Skill | When |
|------|-------|------|
| `fzf` | agent-search | Human interactive pick from long lists |
| `semgrep` | agent-search | Rule/security scans (`--dryrun` default) |
| `hyperfine` | agent-dev-tooling | Benchmarking commands |
| `gitleaks` | [agent-git-workflows](../../agent-git-workflows/SKILL.md) | Secret scan before sharing diffs |
| `ctags` / `tree-sitter` | agent-search | Repeated def/ref across sessions |
| `fff-mcp` | agent-search, mcp-code-intelligence | Project MCP — see [AGENTS.md § fff](../../../../AGENTS.md) |

## Gallery verification (after install)

```powershell
# Tier 0 + Block A sample
fd --version; bat --version; sg --version; ruff --version

# Block B sample
yq --version; just --version

# Project
npm run doctor
npm run lint
```

Full environment checklist: [agent-environment.md](agent-environment.md).
