> **Claude Code:** Same intent as Cursor `/implement`. When customizing, keep in sync with `.cursor/commands/implement.md`.

# /implement — Execute an approved plan

Use when the user has approved a plan or given a small, explicit task.

## Inputs

- Approved plan or task list.
- **AGENTS.md** for lint/test/build commands.

## Steps

1. **Write failing test stubs from the plan, confirm they fail** — encode each acceptance criterion as a test before touching implementation; run them and verify they fail for the right reason.
2. **Implement until stubs pass** — in **minimal diffs**, matching existing style; never assume generated code works until it has been executed.
3. Run **lint** and **tests** from AGENTS.md; fix failures.
4. Summarize what changed and where.

## Done when

- Test stubs written and failing before implementation began.
- All agreed items are implemented.
- Tests pass after implementation.
- Lint and tests pass (or failures are explained with next steps).

## Checklist

- [ ] Test stubs written and failing before implementation began
- [ ] Tests pass after implementation
- [ ] No unrelated refactors
- [ ] No secrets committed
- [ ] AGENTS.md commands run (or documented why not)
