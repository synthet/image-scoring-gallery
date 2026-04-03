# Backlog workflow — picking tasks, tracking status, and keeping docs aligned

This document is the **operating guide** for the Electron gallery backlog. The Python backend keeps the same habits in **[`docs/project/00-backlog-workflow.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/00-backlog-workflow.md)** ([`BACKLOG_GOVERNANCE.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/BACKLOG_GOVERNANCE.md) there is an alias). Here **`00-backlog-workflow.md`** is canonical; [`BACKLOG_GOVERNANCE.md`](BACKLOG_GOVERNANCE.md) is an alias for older links.

This project keeps a **single actionable backlog** in the repository root: [`TODO.md`](../../TODO.md). Files under `docs/integration/TODO.md`, `docs/features/planned/embeddings/TODO.md`, and `docs/planning/01-roadmap-todo.md` are **mirrors or slices** — update them after the root list so wording does not drift.

**Naming:** GitHub repos: **[synthet/image-scoring-backend](https://github.com/synthet/image-scoring-backend)** (Python), **[synthet/image-scoring-gallery](https://github.com/synthet/image-scoring-gallery)** (this app). Local clone folders may use names like `image-scoring-backend` / `image-scoring-gallery`.

---

## Source of truth

| What | Role |
|------|------|
| [`TODO.md`](../../TODO.md) | Canonical open work — checkboxes, markers **`[Python]`**, **`[Gradio]`**, **`[DB]`**, **`[DB+Python]`** |
| [`docs/planning/01-roadmap-todo.md`](../planning/01-roadmap-todo.md) | Planning-friendly mirror of the root backlog (same checkboxes; sync after `TODO.md`) |
| [`docs/integration/TODO.md`](../integration/TODO.md) | REST / WebSocket / config slice only |
| [`docs/features/planned/embeddings/TODO.md`](../features/planned/embeddings/TODO.md) | Embedding UI bridge — detail; no duplicate full-project checklist |
| [`docs/planning/03-high-impact-tracked-tasks.md`](../planning/03-high-impact-tracked-tasks.md) | EIS-* initiatives — scope, definition of done, history |
| [`docs/planning/02-firebird-postgresql-migration.md`](../planning/02-firebird-postgresql-migration.md) | Completed migration — reference, not a live backlog |
| Deep-dive specs under `docs/features/planned/` | Design detail; link from `TODO.md`, do not duplicate full task lists |

---

## How to pick the next task

1. **Confirm reality** — Read the relevant code path, [`03-high-impact-tracked-tasks.md`](../planning/03-high-impact-tracked-tasks.md), or the embedding/integration TODO slice before treating a checkbox as current.
2. **Reduce cross-repo risk first** — Prefer items that align API contracts with the backend; when schema or REST shapes change, follow [Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) (canonical copy in **image-scoring-backend**). Backend tasks tagged **`[Electron]`** map to work in this repo.
3. **Prefer vertical slices** — One end-to-end slice (e.g. IPC handler + UI + types + optional backend follow-up) beats many parallel half-finished tracks.
4. **Database work** — Production paths use **`pg`** (local PostgreSQL) or **`api`** (HTTP SQL to the backend). Read [`02-database-design.md`](../architecture/02-database-design.md) and the backend [`NEXT_STEPS` DB doc](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/database/NEXT_STEPS.md) before assuming legacy Firebird or dual-write behavior.
5. **Embedding / pipeline UI** — Read [`docs/features/planned/embeddings/TODO.md`](../features/planned/embeddings/TODO.md) and backend [`docs/plans/embedding/NEXT_STEPS.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/embedding/NEXT_STEPS.md); the backend may ship endpoints while Electron wiring remains open.

---

## Mirror files and sync order

After you complete, reopen, split, or reprioritize a task:

1. [`TODO.md`](../../TODO.md) — checkboxes, **Last evaluated** date, count snapshot, **Highest-Impact Next Steps** if order changed.
2. [`docs/planning/01-roadmap-todo.md`](../planning/01-roadmap-todo.md) — match items and counts.
3. [`docs/integration/TODO.md`](../integration/TODO.md) — if REST/WS/config rows moved.
4. [`docs/features/planned/embeddings/TODO.md`](../features/planned/embeddings/TODO.md) — if embedding milestones moved.
5. [`docs/planning/03-high-impact-tracked-tasks.md`](../planning/03-high-impact-tracked-tasks.md) — when an EIS track starts or finishes.
6. [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — counts, dependency labels, related doc links.

**Cadence:** Reconcile at least **weekly** and **immediately** after merging work that changes open items.

---

## Tracking status

- **Roadmap / committed work:** Markdown checkboxes in root [`TODO.md`](../../TODO.md) (update when you ship or descope).
- **In-flight work (optional):** GitHub Issues for a specific effort; add the issue link in the PR description or a short note next to the `TODO.md` line if useful.
- **Multi-session or cross-agent coordination (optional):** [mcp-kanban workflow](../../.cursor/skills/mcp-kanban-workflow/SKILL.md) — use when you need persistent tickets outside git.

Pick **one** primary tracking habit for “what we’re doing this week” so the team is not split across unrelated systems.

---

## Hygiene cadence

- **Monthly (or after a large merge):** Reconcile **Last evaluated** / counts in [`TODO.md`](../../TODO.md); scan for duplicate wording across mirrors; align with backend root [`TODO.md`](https://github.com/synthet/image-scoring-backend/blob/main/TODO.md) for **`[Electron]`** / **`[Python]`** pairs.
- **Periodic reviews:** Use the **Unfinished Business Evaluation** section in root [`TODO.md`](../../TODO.md) for snapshot methodology (open vs cross-repo counts).

---

## Related links

- [`TODO.md`](../../TODO.md) — Main backlog
- [`docs/README.md`](../README.md) — Documentation index
- [Backend `00-backlog-workflow.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/00-backlog-workflow.md) — **image-scoring-backend** (canonical; [`BACKLOG_GOVERNANCE.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/BACKLOG_GOVERNANCE.md) is an alias)

[← Project planning index](INDEX.md)
