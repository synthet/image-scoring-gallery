> **Cursor:** Same intent as Claude `/log-session`. Mirror: `.claude/commands/log-session.md`.

# /log-session — Log agent session to raw memory

Record what was done in this session for later consolidation. Does **not** update approved `memory.md`.

Memory scripts live in sibling **image-scoring-backend** (shared engine). From gallery repo root:

## Steps

1. Gather: task summary, files touched, commands/tests run, decisions, blockers, outcome.
2. Add `--candidate "text|category|confidence"` for durable learnings (see backend `.agent-memory/schema.md`).
3. Run (adjust drive letter if needed):

```powershell
python ../image-scoring-backend/scripts/agent-memory/log_session.py --summary "<one line>" --outcome "<result>" --candidate "..."
```

Repeat `--file`, `--command`, `--test`, `--decision`, `--error` as needed. Use `--repo gallery` if the script supports tagging the source repo.

## Done when

- CLI prints path to new session YAML under backend `.agent-memory/raw-sessions/` (or gallery-local if configured)
- No secret patterns in logged content

## Skill

`.cursor/skills/agent-memory/SKILL.md`
