---
description: Project memory — read approved memory at session start; log sessions instead of editing memory.md
alwaysApply: true
---

# Agent memory

Before modifying code, read sibling **image-scoring-backend** `.agent-memory/memory.md` if present. Treat it as helpful but not infallible. Prefer current repository evidence (AGENTS.md, `docs/CANONICAL_SOURCES.md`, code) when they conflict.

## During work

- Do **not** edit `.agent-memory/memory.md` directly.
- When you learn durable facts, preferences, working rules, recurring issues, or successful patterns, record them via **`/log-session`** or `python ../image-scoring-backend/scripts/agent-memory/log_session.py` with `--candidate "text|category|confidence"`.
- Never store secrets, API keys, tokens, credentials, or raw `secrets.json` / `.env` content in memory artifacts.

## Consolidation

- Run **`/dream-memory`** (or `python ../image-scoring-backend/scripts/agent-memory/dream.py`) to propose updates; review the changelog under backend `.agent-memory/dreams/`.
- Promote only after human review: **`/promote-memory`** or `promote_dream.py --dream <path>` on the backend tree.

## Reference

- Operator guide: [`.agent-memory/CURSOR_USAGE.md`](../.agent-memory/CURSOR_USAGE.md)
- Skill: `.cursor/skills/agent-memory/SKILL.md`
