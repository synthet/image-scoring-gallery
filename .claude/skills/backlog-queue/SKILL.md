---
name: backlog-queue
description: Cross-repo GitHub Project board is the canonical task queue. Use whenever picking work, claiming an issue, transitioning Stage, or filing/closing a backlog issue across image-scoring-gallery or image-scoring-backend.
---

> **Claude Code mirror.** Canonical: [`.cursor/skills/backlog-queue/SKILL.md`](../../../.cursor/skills/backlog-queue/SKILL.md). Keep both in sync.

# Backlog queue (Claude Code mirror)

> The canonical task queue is the GitHub Project board:
> **https://github.com/users/synthet/projects/1**
>
> It spans both repos: `synthet/image-scoring-gallery` (this repo) and `synthet/image-scoring-backend`.
> The repo `TODO.md` files are pointers only — **never** add tasks there.

## When to use

- The user asks to pick the next task, start work, or "what's next".
- The user asks to file a new backlog item.
- A PR is being prepared and needs a `Closes #N` reference.
- A task has hit a blocker, is ready for review, or is finished.
- An agent picks up a task without a corresponding issue — stop and file one first.

## Five-step contract

1. **Pick from `Stage = Ready`** (sorted by `priority:p0..p3`). If empty, stop — do not invent work.
2. **Claim**: `/task-claim <N>` (preferred) or the manual `gh` flow below. Adds you as assignee + moves the card to `Claimed`.
3. **Flip `Stage = In Progress`** on the first commit.
4. **If blocked**: move to `Stage = Blocked` *and* leave a comment with the reason and what would unblock it.
5. **PR description must include `Closes #<N>`**. Move card to `Stage = Review` while open; merging closes the issue and flips `Status = Done` (manually move `Stage = Done`).

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
  --single-select-option-id 1cc70f0b   # Claimed
```

## Label taxonomy

| Family | Values |
|--------|--------|
| `area:*` | `python`, `db`, `gradio`, `electron`, `docs` |
| `priority:*` | `p0`, `p1`, `p2`, `p3` |
| `type:*` | `bug`, `feature`, `refactor`, `test`, `chore` |
| (special) | `cross-repo` |

## Reference IDs

| Thing | ID |
|-------|----|
| Project node id | `PVT_kwHOAFXgIs4BWC3c` |
| `Stage` field id | `PVTSSF_lAHOAFXgIs4BWC3czhRaNZ0` |
| Backlog | `83b7a780` |
| Ready | `ddaf7773` |
| Claimed | `1cc70f0b` |
| In Progress | `8b22e18e` |
| Blocked | `4bbe5dd0` |
| Review | `cb723acb` |
| Done | `73062c96` |

## Don'ts

- Don't add tasks to `TODO.md`.
- Don't skip Stage transitions.
- Don't open a PR without `Closes #N`.

Full contract: [`docs/project/00-backlog-workflow.md`](../../../docs/project/00-backlog-workflow.md).
