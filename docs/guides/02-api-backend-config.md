# API Backend Configuration

This gallery can discover the Python backend automatically, but you can also pin or redirect it with `config.json`.

## Migration Note

Legacy Firebird-era keys (for example `database.host`, `database.path`, and top-level `firebird.path`) are kept only for historical context and are no longer first-class configuration fields. Prefer `database.engine` with `database.postgres.*` (or `database.api.*` when using API SQL mode), plus top-level `api.*` overrides documented below.

## Browser vs in-process URL (`api.browserUrl`)

When **`config.api.url`** points at a hostname only resolvable **inside Docker** (for example `http://image-scoring-webui:7860`), the Electron app can still call the API from the host if your setup proxies correctly — but **“Open in browser”** links must use a base URL your OS browser can resolve.

Set optional **`config.api.browserUrl`** to a host-reachable base (commonly `http://127.0.0.1:7860` when the WebUI publishes port `7860` on localhost). The gallery uses **`api.url`** for REST, WebSocket, and lock-file logic, and **`api.browserUrl`** only for opening `/ui/...` in the system browser.

`environment.docker.json` in this repo sets both: internal `url` for the compose network and `browserUrl` for the operator’s machine.

## Resolution Order

The backend base URL is resolved in this order:

1. **`config.api.url`**: exact base URL, highest priority
2. **Sibling backend lock file** (first existing file wins), checked in this exact order:
   - `../image-scoring-backend/webui.lock`
   - `../image-scoring-backend/webui-debug.lock`
   - `../image-scoring/webui.lock` *(legacy repo name)*
   - `../image-scoring/webui-debug.lock` *(legacy repo name)*
3. **Fallback host/port**: `config.api.host` + `config.api.port`
4. **Default fallback**: `http://127.0.0.1:7860` (derived from `electron/constants/network.ts` via `DEFAULT_BACKEND_BASE_URL`)

## When To Use Which Setting

- Use **`config.api.url`** when you want a hard override and do not want lock-file discovery to change the target.
- Use **`config.api.host`** and **`config.api.port`** when you want to change the fallback target used when no sibling backend lock file is present.
- Leave all three unset when the backend repo is a sibling checkout and writes `webui.lock` normally.

## Example

```json
{
  "api": {
    "url": "http://192.168.1.50:7860"
  }
}
```

Hard override with exact URL:

- Always uses `http://192.168.1.50:7860`
- Ignores sibling `webui.lock` port discovery

```json
{
  "api": {
    "host": "127.0.0.1",
    "port": 9000
  }
}
```

Fallback host/port:

- Uses `http://127.0.0.1:9000` only when no sibling backend lock file is found
- If a sibling backend lock file exists, the discovered port still wins

## Expected Project Layout

Automatic lock-file discovery checks these sibling locations relative to the gallery repo:

- `../image-scoring-backend/webui.lock`
- `../image-scoring-backend/webui-debug.lock`
- `../image-scoring/webui.lock` *(legacy path retained for backwards compatibility)*
- `../image-scoring/webui-debug.lock` *(legacy path retained for backwards compatibility)*
