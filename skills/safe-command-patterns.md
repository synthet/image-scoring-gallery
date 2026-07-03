# Safe Command Patterns

## Purpose
Rules for commands an autonomous coding agent may run without confirmation, and commands requiring explicit human confirmation. Prefer bounded output, dry-runs, and check modes.

## When to Use
- Start here when the task touches CLI tooling, repository navigation, editing, verification, or agent MCP/code-intelligence setup.
- Use before installing heavyweight indexers or running broad commands.

## Required Tools
- See this skill's tool list and the install checklist. Prefer project-pinned tools when available.

## Install

### Windows PowerShell
```powershell
winget install Git.Git
winget install GitHub.cli
winget install BurntSushi.ripgrep.MSVC
winget install sharkdp.fd
winget install jqlang.jq
winget install dandavison.delta
winget install sharkdp.bat
winget install ajeetdsouza.zoxide
winget install OpenJS.NodeJS.LTS
corepack enable
corepack prepare pnpm@latest --activate
npm i -g @ast-grep/cli
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
uv tool install ruff
uv tool install pyright
```
Scoop alternatives when winget IDs are unavailable: `scoop install git gh ripgrep fd jq delta bat zoxide fzf hyperfine`, then add tool-specific packages.

### WSL2 Ubuntu
```bash
sudo apt update
sudo apt install -y git curl jq ripgrep fd-find shellcheck sqlite3 direnv
mkdir -p ~/.local/bin && ln -sf /usr/bin/fdfind ~/.local/bin/fd
curl -LsSf https://astral.sh/uv/install.sh | sh
curl https://mise.run | sh
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin
# Node/pnpm: prefer mise/asdf/nvm or NodeSource; then:
corepack enable
corepack prepare pnpm@latest --activate
npm i -g @ast-grep/cli pyright
uv tool install ruff
```

### macOS
```bash
brew install git gh ripgrep fd fzf tree eza zoxide bat git-delta jq yq dasel sqlite curlie httpie just mise direnv uv ruff pyright node pnpm ast-grep semgrep tree-sitter universal-ctags shellcheck shfmt prettier eslint hadolint trivy hyperfine entr watchexec watchman
corepack enable
corepack prepare pnpm@latest --activate
```

## Common Commands
```bash
git status --short
rg "SomeSymbol" . --glob '!node_modules' --glob '!target' --glob '!build' --glob '!dist' -n
fd "Controller|Service|Repository" .
tree -L 3 -I 'node_modules|target|build|dist|.git'
sed -n '1,160p' path/to/file.java
bat --line-range 1:160 path/to/file.java
git diff --stat
git diff -- path/to/file | delta
jq '.scripts' package.json
yq '.services' docker-compose.yml
```
PowerShell equivalents:
```powershell
git status --short
rg "SomeSymbol" .
fd "Controller|Service|Repository"
Get-Content .\path\to\file.java -TotalCount 160
git diff --stat
```

## Agent-Safe Patterns
- Inspect `git status --short` before editing.
- Bound output with `--max-count`, `--max-filesize`, `head`, `sed -n`, `bat --line-range`, `tree -L`, or `git diff --stat`.
- Prefer dry-run/check modes: `semgrep --config auto --dryrun`, `ruff check`, `prettier --check`, `eslint .`, `docker compose config`.
- Prefer project commands: `just --list`, `mise tasks`, `npm run`, `pnpm run`, `make help`, Gradle/Maven task lists.

## Commands Requiring Confirmation
- Deleting or overwriting: `rm -rf`, `del /s`, `git clean`, `git reset --hard`, mass `mv`, generated-file purges.
- History/repo rewrites: `git filter-repo`, `git rebase`, `git push --force`, branch deletion.
- Credential/security or network-heavy scans against third-party targets.
- Auto-fixers that touch many files: `eslint --fix`, `prettier --write`, `ruff --fix`, `semgrep --autofix`, `ast-grep -U`, codemods.

## Troubleshooting
- Windows: restart PowerShell after installs; check PATH with `Get-Command rg,fd,git,jq`; prefer WSL2 for Unix-path repos.
- WSL2/Linux: Debian names fd as `fdfind`; symlink to `fd`; keep repos under `~/src`, not `/mnt/c`.
- macOS: prefer Homebrew packages, and run `brew update` if formulas are missing.

## Verification Checklist
```bash
git --version
rg --version
fd --version || fdfind --version
jq --version
node --version
corepack --version
python --version || python3 --version
```

References checked: official docs/repos for ripgrep, fd, fzf, tree/eza/zoxide/bat/delta, ast-grep, Semgrep, tree-sitter, universal-ctags, Serena, Zoekt, git/gh/git-filter-repo/gitleaks, jq/yq/dasel/sqlite/curl/httpie, just/mise/direnv/uv/ruff/pyright/pnpm/Corepack/Docker, shellcheck/shfmt/prettier/eslint/hadolint/trivy, hyperfine/entr/watchexec/watchman.

