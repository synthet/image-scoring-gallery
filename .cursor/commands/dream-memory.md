> **Cursor:** Same intent as Claude `/dream-memory`. Mirror: `.claude/commands/dream-memory.md`.

# /dream-memory — Propose consolidated project memory

Merge recent session logs with current `memory.md` into a **proposal only**.

Scripts: sibling **image-scoring-backend** `scripts/agent-memory/`.

## Steps

1. Run from gallery root:

```powershell
python ../image-scoring-backend/scripts/agent-memory/dream.py
```

2. Open the printed `dreams/YYYY-MM-DD-HHMM.md` and matching `*-changelog.md` under backend `.agent-memory/dreams/`.
3. Summarize for the user: **Added**, **Uncertain / needs review**, and any **Removed**.
4. Do **not** promote without explicit user approval.

## Done when

- Dream and changelog exist under backend `.agent-memory/dreams/`
- `memory.md` is unchanged
- User has a clear review summary

## Skill

`.cursor/skills/agent-memory/SKILL.md`
