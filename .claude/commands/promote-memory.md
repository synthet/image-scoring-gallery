> **Cursor:** Same intent as Claude `/promote-memory`. Mirror: `.claude/commands/promote-memory.md`.

# /promote-memory — Approve dream into active memory

After human review of a dream proposal, promote it to `.agent-memory/memory.md` (backend canonical store).

## Inputs

- Path to reviewed dream file (from `/dream-memory` output).

## Steps

```powershell
python ../image-scoring-backend/scripts/agent-memory/promote_dream.py --dream ../image-scoring-backend/.agent-memory/dreams/<timestamp>.md
```

Requires matching `*-changelog.md` unless user confirms `--force`.

## Done when

- Backend `memory.md` updated
- Previous memory archived under `.agent-memory/dreams/archive/`

## Skill

`.cursor/skills/agent-memory/SKILL.md`
