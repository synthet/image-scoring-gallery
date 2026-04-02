---
name: mcp-kanban-workflow
description: Coordinate multi-step or multi-session work with mcp-kanban tickets, board snapshots, and handoff logs. Trigger when the user asks for kanban, task board, MCP tickets, agent handoff, or persistent work queue.
---

# mcp-kanban workflow

Same workflows as the Python backend skill: use MCP server **`mcp-kanban`** with **absolute** `projectFolder` values.

## Project folders

- **Gallery / Electron UI work:** `D:\Projects\image-scoring-gallery` (adjust if your clone path differs)
- **Backend / API / ML work:** `D:\Projects\image-scoring-backend`

Register each scope with `kanban_register_project` before creating tickets if it is not already listed in `kanban_list_projects`.

## Steps

1. **New task:** `kanban_register_project` (if needed) → `kanban_create_ticket`.
2. **Handoff:** `kanban_list_tickets` → `kanban_get_ticket` → `kanban_add_work_log` / `kanban_update_ticket`.
3. **Queue:** `kanban_pull_next_ticket` → `kanban_start_ticket` → complete or update.

## References

- Rule: `.cursor/rules/mcp-kanban.mdc`
- Full step text and tool list: `D:\Projects\image-scoring-backend\.cursor\skills\mcp-kanban-workflow\SKILL.md` (canonical copy)
- User MCP config must include **`mcp-kanban`** (Cursor / Claude / Antigravity / Codex)
