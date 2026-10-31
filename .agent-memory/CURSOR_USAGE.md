# Agent memory — gallery pointer

**image-scoring-gallery** does not host a separate dream engine. Memory scripts and the canonical store live in sibling **image-scoring-pipeline**:

| Artifact | Location |
|----------|----------|
| Scripts | `../image-scoring-pipeline/scripts/agent-memory/` |
| Approved memory | `../image-scoring-pipeline/.agent-memory/memory.md` |
| Session logs | `../image-scoring-pipeline/.agent-memory/raw-sessions/` |
| Dream proposals | `../image-scoring-pipeline/.agent-memory/dreams/` |

## Quick commands (from gallery root)

```powershell
python ../image-scoring-pipeline/scripts/agent-memory/log_session.py --summary "..." --outcome "..."
python ../image-scoring-pipeline/scripts/agent-memory/context.py
```

Slash commands: `/log-session`, `/dream-memory`, `/promote-memory`, `/memory-context` — see `.cursor/commands/`.

Full operator guide: [backend `.agent-memory/CURSOR_USAGE.md`](https://github.com/synthet/image-scoring-pipeline/blob/main/.agent-memory/CURSOR_USAGE.md).
