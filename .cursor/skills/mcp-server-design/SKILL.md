---
name: mcp-server-design
description: Design and implement an MCP server's tools, resources, and prompts with safe transport and input validation. Use when building or extending a Model Context Protocol server for agent integration.
---

# MCP server design

## Use this skill when

- Creating or extending the gallery MCP server (`mcp-server/`, `is-ui-mcp` / `is-ui-live`)
- Adding tools, resources, or prompts to `mcp-server/action_registry.json`
- Configuring `.cursor/mcp.example.json`

## Procedure

1. Read the [MCP specification](https://modelcontextprotocol.io/specification) and backend `docs/technical/MCP_SEARCH_DISPATCH.md`.
2. Pick a clear, stable **server name** and action IDs (`local.*`, `api.*`, `live.*`).
3. **Transport:** stdio by default (`is-ui-mcp`); optional SSE (`is-ui-live` when Electron dev is running). Pass secrets via **environment variables**, never CLI args.
4. **Tools** — validate every input with a schema (Zod in `mcp-server/`). Prefer compact **`search` + `dispatch`** over dozens of raw tools.
5. **Separate read from write.** Read-only tools are safe-by-default; **write/side-effecting tools**
   must require explicit confirmation.
6. **Resources** — expose read-only context (gallery status, config) — **no secrets**.
7. On a downstream/dependency failure: return **structured diagnostics** (`live_unavailable`, `api_unreachable`), do not throw opaque errors.
8. Test tool handlers with mocked dependencies (no live side effects in unit tests).
9. Regenerate registry: `cd mcp-server && npm run build:registry`.

## Safety checks

- No raw shell / file / network / arbitrary-code tools without an explicit approval policy.
- All tool inputs validated against a schema.
- See [.agent/SAFETY.md](../../../.agent/SAFETY.md).

## Done criteria

- Action list matches `mcp-server/action_registry.json`; descriptions are accurate.
- Secrets only via env; never logged or returned in tool output.
- `npm run build:registry` succeeds.

References: [MCP docs](https://modelcontextprotocol.io), backend `docs/guides/setup/mcp-compact-servers.md`.
