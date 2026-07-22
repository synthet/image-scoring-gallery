# Agent memory — gallery pointer

**image-scoring-gallery** does not host a separate dream engine. Memory scripts and the canonical store live in sibling **image-scoring-backend**:

| Artifact | Location |
|----------|----------|
| Scripts | `../image-scoring-backend/scripts/agent-memory/` |
| Approved memory | `../image-scoring-backend/.agent-memory/memory.md` |
| Session logs | `../image-scoring-backend/.agent-memory/raw-sessions/` |
| Dream proposals | `../image-scoring-backend/.agent-memory/dreams/` |

## Quick commands (from gallery root)

```powershell
python ../image-scoring-backend/scripts/agent-memory/log_session.py --summary "..." --outcome "..."
python ../image-scoring-backend/scripts/agent-memory/context.py
```

Slash commands: `/log-session`, `/dream-memory`, `/promote-memory`, `/memory-context` — see `.cursor/commands/`.

Full operator guide: [backend `.agent-memory/CURSOR_USAGE.md`](https://github.com/synthet/image-scoring-backend/blob/main/.agent-memory/CURSOR_USAGE.md).
