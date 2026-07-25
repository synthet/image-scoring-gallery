# /compile-skill — Lower a stable skill into a deterministic harness

Use when a procedural skill has crystallized and agents keep paying the reasoning tax to re-derive
the same steps. Compiles the fixed parts into a script under `scripts/agent_skills/` and shrinks the
skill to a thin bootloader. Pattern and partition rules:
[`.agent/SKILL_COMPILATION.md`](../../.agent/SKILL_COMPILATION.md).

## Inputs

- Target skill: `.cursor/skills/<name>/SKILL.md` (or a command). If the user did not name one, list
  uncompiled candidates with the stability evidence you have and ask — do not pick silently.
- Stability evidence: repeated transcripts running the same procedure, or a row in
  [`.agent/SKILL_INVENTORY.md`](../../.agent/SKILL_INVENTORY.md) with real usage.

## Readiness gate

Compile only if **all** hold. If any fails, say "not ready" and name the failing condition instead of
compiling an unstable procedure.

- Same sources, filters, and state every run — no per-run re-planning.
- At least one step is pure mechanics (path resolution, parsing, `package.json` / `CHANGELOG.md`
  rewrites, IPC or API-type checks, lint/test invocation, report skeletons).
- The judgment left over is nameable in a sentence or two ("choose the semver level").
- The skill is not mostly judgment. `systematic-debugging`, `karpathy-guidelines`, `security-review`,
  and `subagent-review` have nothing to lower — leave them as prose.

## Step 1 — Partition the steps

Produce this table before writing code, and show it to the user. It must agree with the partition
rules in `.agent/SKILL_COMPILATION.md`:

| Owner | Gets |
|-------|------|
| **Code** | Known paths, parsing, semver math, file rewrites, IPC/API-type checks, lint/test invocation, report skeletons |
| **LLM** | Ambiguous change classification, AC verdicts from messy evidence, PR narrative, bug hunting, UI/UX judgment |
| **Human** | Commit, push, publish, release tagging, board transitions, consequential overrides |

If a step needs a heuristic to stay correct, it belongs to the LLM. Freezing judgment into rules is
the main way this pattern fails.

## Step 2 — Implement the harness

```text
scripts/agent_skills/<name>.mjs   # or .py — match the surrounding script language
```

- Match the neighbors: `.mjs` like `scripts/check-type-sync.mjs` and `scripts/doctor.mjs` for
  anything inspecting TypeScript, IPC, or `package.json`; Python like `scripts/ci/*.py` for
  agent-asset governance. No new runtime dependencies — Node stdlib or Python stdlib.
- Resolve the repo root relative to the script file — no hardcoded absolute paths.
- Read-only by default. Inspect/plan run free; writes need an explicit `apply` subcommand or `--run`.
- Support `--json` for agents and a readable summary otherwise. Errors to stderr, non-zero exit.
- Emit a `needs_llm_judgment` marker rather than guessing when evidence is ambiguous — that is the
  handoff back to the model.
- The harness never commits, pushes, tags, or exports outside the repo.

## Step 3 — Shrink the skill to a bootloader

Keep `name` first and a non-empty `description` in frontmatter, then keep only: when to use,
**Invoke** (copy-pasteable commands), **LLM judgment slots** (numbered), **Human authority**, and
**Verify**. Delete prose the harness now enforces.

## Step 4 — Test

Add a vitest spec alongside the repo's other script tests and run:

```bash
npm run test:run
```

Assert behavioral parity with the prose procedure on at least one realistic fixture — that is the
evidence the compile was lossless.

## Step 5 — Sync and record

```bash
python scripts/sync_assistant_trees.py
python scripts/sync_assistant_trees.py --check
python scripts/ci/check_agent_frontmatter.py
python scripts/validate_cli_hub_skills.py   # when a CLI-hub skill changed
npm run lint
```

Then update [`.agent/SKILL_COMPILATION.md`](../../.agent/SKILL_COMPILATION.md) (new row in the
compiled table), [`.agent/SKILL_INVENTORY.md`](../../.agent/SKILL_INVENTORY.md) (note the harness
path, refresh **Last reviewed**), and apply
[`.agent/SKILL_CHANGE_AST10_REVIEW.md`](../../.agent/SKILL_CHANGE_AST10_REVIEW.md).

## Done when

- Partition table was shown and the LLM slots are named in the bootloader.
- Harness runs read-only by default, emits `--json`, and hands ambiguity back to the model.
- Tests pass and demonstrate parity on a real case.
- Sync, frontmatter, and lint are green; `.cursor/` is canonical and `.claude/` was regenerated.

## Do not

- Do not hand-edit `.claude/` — it is generated from `.cursor/` by `sync_assistant_trees.py`.
- Do not give the harness commit/push/tag or external-export authority.
- Do not add an npm dependency for a harness; stdlib only.
- Do not claim numeric token savings; this repo has no per-session telemetry. Savings are structural.
