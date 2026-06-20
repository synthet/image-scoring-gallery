---
type: Guide
title: Agent cull review (Gallery operator)
description: How the Agent cull review panel works in Driftara Gallery and what to do when the backend cannot reach the Gemini CLI.
resource: docs/guides/04-agent-cull-review.md
tags: [gallery-docs, guides, culling, agent-cull-review]
timestamp: 2026-06-18T00:00:00Z
okf_version: 0.1
---

# Agent cull review (Gallery operator)

The **Agent cull review** banner appears when viewing a stack or substack with the Stacks toggle on. It calls the backend `POST /api/culling/agent-review/run` (dry-run by default). No files are deleted or moved — only metadata-only removal **candidates** are proposed.

**Backend setup (authoritative):** [image-scoring-backend — Agent cull review Gemini CLI setup](https://github.com/synthet/image-scoring-backend/blob/main/docs/guides/setup/agent-cull-review-gemini-cli.md)

## UI components

| Piece | Location |
|-------|----------|
| `AgentCullReviewPanel` | `src/components/CullingAnalytics/AgentCullReviewPanel.tsx` |
| Error labels | `src/components/CullingAnalytics/analyticsChipLabels.ts` (`friendlyAgentError`) |
| IPC | `electron/apiService.ts` → `runAgentCullReview`, `getAgentCullGroups`, … |

## Typical workflow

1. Open a stack with picks and rejects (sub-stack leaf or flat stack).
2. Click **Run dry-run review**.
3. Review recommendations; approve/reject per image or **Mark safe candidates** when not in dry-run.

## “Gemini CLI was not found” (fixed setup)

Gallery shows this when the backend returns `agent_cli_not_found` — the WebUI process could not spawn `culling.agent_review.agent.command`.

**Most common cause (Docker):** `config.json` used a WSL host path (`/mnt/d/Projects/...`) while the WebUI runs in the **`image-scoring-webui` container**, where the repo is `/app`. Use `/app/scripts/wsl/gemini_agent.sh`, rebuild the image (Gemini CLI baked in), and set `GEMINI_CONFIG_SOURCE` in backend `.env`. Full steps: backend guide linked above.

After backend fix, restart the WebUI container and retry **Run dry-run review** — the yellow PATH message should disappear.

## Other backend errors

| Message (friendly) | Backend code | Action |
|--------------------|--------------|--------|
| Agent cull review is disabled… | `agent_review_disabled` | Enable `culling.agent_review.enabled` in backend `config.json` |
| Picks changed since this review… | `stale_group_state` | Re-run dry-run review |
| This is a dry-run review… | `dry_run_group` | Re-run without dry-run to apply |

## Related

- [Culling stack analytics](../features/implemented/06-culling-stack-analytics.md) — sibling analytics banner on the same views
- [Agent-assisted cull review worklog](../specs/agent-assisted-cull-review/worklog.md)
- Backend spec: [agent-assisted-cull-review](https://github.com/synthet/image-scoring-backend/tree/main/docs/specs/agent-assisted-cull-review)
