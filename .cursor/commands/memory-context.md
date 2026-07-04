> **Cursor:** Same intent as Claude `/memory-context`. Mirror: `.claude/commands/memory-context.md`.

# /memory-context — Print memory for a new session

Output compact approved memory for paste or `@../image-scoring-backend/.agent-memory/memory.md`.

## Steps

```powershell
python ../image-scoring-backend/scripts/agent-memory/context.py
```

Or instruct the user to reference sibling backend `.agent-memory/memory.md` directly.

## Session-start prompt

> Before modifying code, read sibling backend `.agent-memory/memory.md` if present. Treat it as helpful but not infallible. Prefer current repository evidence over memory if they conflict. If you discover durable project facts, user preferences, recurring issues, or successful patterns, add them to the session log instead of editing memory directly.

## Done when

- Memory block shown (truncated per backend `config.json` if needed)

## Skill

`.cursor/skills/agent-memory/SKILL.md`
