---
name: backlog-queue
description: Cross-repo GitHub Project board is the canonical task queue. Spans image-scoring-gallery and image-scoring-backend. Use whenever picking work, claiming an issue, transitioning Stage, or filing a new backlog item.
risk: L1
canonical: .cursor/skills/backlog-queue/SKILL.md
---

# Backlog queue (.agent mirror)

> **This is the third-party-agent mirror** (Gemini Code Assist / Antigravity / generic agent harnesses). The canonical version is [`.cursor/skills/backlog-queue/SKILL.md`](../../../.cursor/skills/backlog-queue/SKILL.md).

## TL;DR

The canonical task queue is the GitHub Project board:

**→ https://github.com/users/synthet/projects/1**

It surfaces issues from both repos. The `TODO.md` files are pointers — never edit them.

## When to use

- Picking the next task / "what should I work on".
- Filing a new backlog item.
- Preparing a PR (must contain `Closes #N`).
- Hitting a blocker, opening for review, or finishing a task.

## Five-step contract

1. **Pick from `Stage = Ready`** (sorted by `priority:p0..p3`). If empty, stop and ask — do not invent work.
2. **Claim**: `/task-claim <N>` (preferred) or the manual `gh` flow below. Adds you as assignee + moves the card to `Claimed`.
3. **Flip `Stage = In Progress`** on the first commit.
4. **If blocked**: move to `Stage = Blocked` *and* leave a comment with the reason and what would unblock it. Do not silently abandon a Claimed card.
5. **PR description must include `Closes #<N>`**. Move card to `Stage = Review` while the PR is open; merging closes the issue and flips `Status = Done` (move `Stage = Done` manually).

## Manual `gh` workflow

```bash
REPO="image-scoring-gallery"   # or image-scoring-backend
N=<issue-number>

gh issue view "$N" --repo "synthet/$REPO" --json number,state,assignees,title
gh issue edit "$N" --repo "synthet/$REPO" --add-assignee @me

ITEM_ID=$(gh project item-list 1 --owner synthet --format json --limit 200 \
  | jq -r --argjson n "$N" --arg repo "$REPO" \
      '.items[] | select(.content.number==$n) | select((.content.repository // "") | endswith($repo)) | .id')

gh project item-edit --id "$ITEM_ID" \
  --project-id PVT_kwHOAFXgIs4BWC3c \
  --field-id PVTSSF_lAHOAFXgIs4BWC3czhRaNZ0 \
  --single-select-option-id 1cc70f0b
```

## Reference IDs

| Thing | ID |
|-------|----|
| Project node id | `PVT_kwHOAFXgIs4BWC3c` |
| Project number | `1` |
| Owner | `synthet` (user-level) |
| `Stage` field id | `PVTSSF_lAHOAFXgIs4BWC3czhRaNZ0` |
| `Backlog` | `83b7a780` |
| `Ready` | `ddaf7773` |
| `Claimed` | `1cc70f0b` |
| `In Progress` | `8b22e18e` |
| `Blocked` | `4bbe5dd0` |
| `Review` | `cb723acb` |
| `Done` | `73062c96` |

## Don'ts

- Don't add tasks to `TODO.md`.
- Don't skip Stage transitions.
- Don't open a PR without `Closes #N`.

Full contract: [`docs/project/00-backlog-workflow.md`](../../../docs/project/00-backlog-workflow.md).
