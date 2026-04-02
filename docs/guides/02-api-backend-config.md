# API Backend Configuration

This gallery can discover the Python backend automatically, but you can also pin or redirect it with `config.json`.

## Resolution Order

The backend base URL is resolved in this order:

1. **`config.api.url`**: exact base URL, highest priority
2. **Sibling backend lock file**: `webui.lock` / `webui-debug.lock` from `image-scoring-backend` or legacy `image-scoring`
3. **Fallback host/port**: `config.api.host` + `config.api.port`
4. **Default fallback**: `http://127.0.0.1:7860`

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
- `../image-scoring/webui.lock`
- `../image-scoring/webui-debug.lock`

This supports the current `image-scoring-backend` repo name and the older `image-scoring` layout.
