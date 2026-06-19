> **Claude Code:** Same intent as Cursor `/decompose`. When customizing, keep in sync with `.cursor/commands/decompose.md`.

# /decompose — Break a task into parallelizable subtasks

Use after a `/spec` exists (or for a sizable task) and **before** `/plan`. The goal is
to split work into independent units a fleet of agents can execute on separate
branches simultaneously — humans orchestrate, agents execute.

## Inputs

- Approved spec or a tight task description.
- Constraints and tech stack (see **AGENTS.md**).

## Output

1. **Subtask list** — For each subtask:
   - **Title**
   - **Done means** — one-liner describing the verifiable end state.
   - **Size** — `S` / `M` / `L`.
   - **Dependencies** — which other subtasks (if any) must land first.

2. **Dependency graph** — Show ordering and call out which subtasks are **independent**
   (no shared edits, no ordering constraint) and can run in parallel. A simple
   list/edge form is fine, e.g. `A → C`, `B → C`, `A ∥ B`.

3. **Parallel execution note** — State it explicitly, e.g.:
   > "Subtasks X, Y, Z are independent. Run as separate branches simultaneously using
   > git worktrees or separate sessions."

4. **Test boundaries** — For each subtask, how it validates **independently**: which
   failing test stubs / assertions prove it done on its own branch without the others.

## Done when

- Each subtask can be `/plan`-ed independently with no hidden dependencies.
- Every subtask has a one-line "done means" and an independent test boundary.
- Independent subtasks are clearly marked as parallel-safe.

## Note

If the user has not approved implementation, **do not** apply code changes — this
command only produces the decomposition.
