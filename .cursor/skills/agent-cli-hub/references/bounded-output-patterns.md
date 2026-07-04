# Bounded output patterns

Prefer these over unbounded `cat`, full-tree walks, or dumping entire files.

## Text search (gallery defaults)

```bash
rg "SomeSymbol" . \
  --glob '!node_modules' \
  --glob '!dist' \
  --glob '!mcp-server/dist' \
  -n --max-count 50
```

```powershell
rg "SomeSymbol" . --glob '!node_modules' --glob '!dist' -n
```

## Find files

```bash
fd "pattern" . -t f
tree -L 3 -I 'node_modules|dist|mcp-server/dist|.git'
```

## Read file slices

```bash
sed -n '1,160p' path/to/file.ts
bat --line-range 1:160 path/to/file.ts
```

```powershell
Get-Content .\path\to\file.ts -TotalCount 160
```

## Git (before and after edits)

```bash
git status --short
git diff --stat
git diff -- path/to/file | delta
```

## Config inspection

```bash
jq '.scripts' package.json
jq '.database.engine' config.json
```

Never paste full `config.json` if it may contain credentials — redact connection strings.

## fff MCP (when connected)

When user-level **fff** MCP is connected, prefer `ffgrep` / `fffind` / `fff-multi-grep` for repeated repo search instead of unbounded shell grep loops. Still cap what you paste into agent responses.

## Dry-run / check modes

```bash
npm run lint
prettier --check .
eslint .
docker compose config
```
