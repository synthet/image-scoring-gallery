# Agent infrastructure inventory — image-scoring-gallery

**Last reviewed:** 2026-05-16. **Backend authority:** [image-scoring-backend docs/CANONICAL_SOURCES.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/CANONICAL_SOURCES.md).

| Path | Purpose | Scope | Status | Upstream authority | Recommended action |
|------|---------|--------|--------|--------------------|--------------------|
| [AGENTS.md](../AGENTS.md) | Commands, MCP keys, Cursor Cloud notes | gallery, MCP | active | package.json, backend AGENTS.md | Keep `is-ui-*` / `is-be-mcp` wording aligned with backend AGENTS.md |
| [CLAUDE.md](../CLAUDE.md) | Orientation, backlog, integration | cross-repo | active | CANONICAL_SOURCES | Link `.agent/*` hubs |
| [.agent/PROJECT_GUIDE.md](PROJECT_GUIDE.md) | Agent navigation | docs-only | active | — | Point to AGENT_INFRA_INVENTORY |
| [.agent/SKILL_INVENTORY.md](SKILL_INVENTORY.md) | Skills index (AST09) | governance | active | `.cursor/skills/` | None |
| [.agent/mcp_tools_reference.md](mcp_tools_reference.md) | MCP notes | MCP | active | Backend AGENTS.md | Prefer linking backend catalog |
| [.agent/ai_edit_spec.md](ai_edit_spec.md) | AI edit rules | coding | active | — | None |
| [.agent/COMMANDS.md](COMMANDS.md) | Verified commands | testing | active | DEVELOPMENT.md | Maintain |
| [.agent/SAFETY.md](SAFETY.md) | Hygiene, IPC boundary | governance | active | CANONICAL_SOURCES | None |
| [.agent/AGENT_INFRA_STATUS.json](AGENT_INFRA_STATUS.json) | Machine-readable status | governance | active | This file | Update after validation |
| [.agent/subagents/README.md](subagents/README.md) | Gallery logical roles | coding | active | .cursor/agents | None |
| [.agent/AGENT_INFRA_INVENTORY.md](AGENT_INFRA_INVENTORY.md) | Catalog of agent-facing paths | governance | active | This file | Refresh on major infra changes |
| [.cursor/rules/agent-canonical-sources.mdc](../.cursor/rules/agent-canonical-sources.mdc) | IPC boundary, backend authority, commands | gallery, cross-repo | active | docs/CANONICAL_SOURCES.md | Mirror `.claude/rules/` |
| [.claude/rules/agent-canonical-sources.mdc](../.claude/rules/agent-canonical-sources.mdc) | Claude mirror of canonical-sources rule | gallery | duplicate-of | `.cursor/rules/agent-canonical-sources.mdc` | Same-PR sync |
| [.cursor/commands/*.md](../.cursor/commands/) | Slash commands | workflow | active | agent-sdlc | None |
| [.cursor/skills/*/SKILL.md](../.cursor/skills/) | Skills (no `.claude` mirror) | coding | active | SKILL_INVENTORY | None |
| [.cursor/agents/*.md](../.cursor/agents/) | Subagents | coding | active | AGENTS.md | Sync `.claude/agents/` |
| [.cursor/rules/external-cli-subagents.mdc](../.cursor/rules/external-cli-subagents.mdc) | External Codex/Gemini review safety | governance | active | subagent-orchestrator | Mirror `.claude/rules/` |
| [.cursor/skills/subagent-review/](../.cursor/skills/subagent-review/) | MCP external review workflow | workflow | active | `../subagent-orchestrator` | Mirror `.claude/skills/` |
| [docs/technical/EXTERNAL_CLI_REVIEWS.md](../docs/technical/EXTERNAL_CLI_REVIEWS.md) | Setup for imgscore-el-subagent-orchestrator MCP | cross-repo | active | backend EXTERNAL_CLI_REVIEWS | None |
| [.claude/commands/*.md](../.claude/commands/) | Claude commands | workflow | active | .cursor/commands | Keep aligned |
| [.claude/rules/documentation.mdc](../.claude/rules/documentation.mdc) | Wiki rules mirror | docs-only | duplicate-of | .cursor/rules/documentation.mdc | Sync on doc rule changes |
| [.claude/skills/backlog-queue/SKILL.md](../.claude/skills/backlog-queue/SKILL.md) | Board contract mirror | cross-repo | duplicate-of | .cursor/skills/backlog-queue | Same-PR sync |
| [.claude/agents/*.md](../.claude/agents/) | Subagent mirrors | coding | duplicate-of | .cursor/agents | Same-PR sync |
| [.agent/skills/*/SKILL.md](skills/) | Third-party / mirror skills | mixed | mixed | .cursor/skills where dup | `firebird-db` filename is historical; body documents PostgreSQL |
| [.agent/workflows/*.md](workflows/) | Workflows | workflow | active | AGENTS.md | Includes verify_gallery, run_gallery_dev, cross_repo_contract_change, debug_* |
| Other [.cursor/rules/*.mdc](../.cursor/rules/) | SDLC, backlog-queue, documentation, implementation, … | gallery | active | CANONICAL_SOURCES | Exclude only if superseded by agent-canonical-sources |
| [docs/CANONICAL_SOURCES.md](../docs/CANONICAL_SOURCES.md) | Authority map | cross-repo | active | Backend GitHub URLs | None |
| [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) | Dev commands | testing | active | package.json | None |
| [docs/WIKI_SCHEMA.md](../docs/WIKI_SCHEMA.md) | Wiki taxonomy | docs-only | active | documentation.mdc | None |
| [docs/log.md](../docs/log.md) | Wiki log | docs-only | active | WIKI_SCHEMA | Append on infra changes |
| [docs/project/00-backlog-workflow.md](../docs/project/00-backlog-workflow.md) | Board contract | cross-repo | active | backlog-queue rule | None |
| [docs/integration/TODO.md](../docs/integration/TODO.md) | Integration follow-ups | cross-repo | active | AGENT_COORDINATION | None |
| [docs/architecture/02-database-design.md](../docs/architecture/02-database-design.md) | pg vs api modes | gallery | active | electron/db/provider.ts | None |
| [.cursorrules](../.cursorrules) | IDE stub pointing at CLAUDE.md / .cursor/rules / CANONICAL_SOURCES | coding | active (rewritten 2026-05-15) | CANONICAL_SOURCES, CLAUDE.md | Keep thin; do not let it drift back into a full duplicate |

## Deprecated / historical

| Path | Issue | Action |
|------|--------|--------|
| `scripts/{add_uuids,remove_duplicates,sync_backup_uuids}.js` | Legacy one-shot maintenance using `node-firebird` (no longer in package.json) | Dead unless reintroduced; archive in a follow-up issue |

## Glob coverage

- **Rules:** `.cursor/rules/*.mdc`
- **Commands:** `.cursor/commands/*.md`
- **Skills:** `.cursor/skills/*/SKILL.md`
- **Agents:** `.cursor/agents/*.md`, `.claude/agents/*.md`
- **Workflows:** `.agent/workflows/*.md`
