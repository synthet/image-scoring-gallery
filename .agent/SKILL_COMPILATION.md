# Skill compilation (specialized harnesses)

Pattern adapted from [Compiling an AI agent skill](https://vivekhaldar.com/articles/compiling-an-ai-agent-skill/)
(Vivek Haldar / Token Shrinker method). Sibling implementation with real harnesses:
[`image-scoring-backend/.agent/SKILL_COMPILATION.md`](https://github.com/synthet/image-scoring-backend/blob/main/.agent/SKILL_COMPILATION.md).

## Why

Natural-language `SKILL.md` files are excellent for **discovering** a workflow. Once the same
procedure runs repeatedly, paying a frontier model to re-plan, rebuild state, and re-interpret fixed
rules is wasteful (the "reasoning tax").

**Compile** the crystallized steps into deterministic code. Keep the model only for semantic judgment.
Keep humans for consequential actions.

## Partition rules

| Owner | Owns |
|-------|------|
| **Code** | Known paths, parsing, semver math, `package.json` / `CHANGELOG.md` rewrites, IPC and API-type checks, lint/test invocation, report skeletons |
| **LLM** | Ambiguous change classification, AC verdicts from messy evidence, PR narrative, bug hunting, UI/UX judgment, review synthesis |
| **Human** | Commit, push, publish, release tagging, promote memory, board transitions, consequential overrides |

## Layout

```text
scripts/agent_skills/<name>.{mjs,py}   # deterministic CLI; prefer --json for agents
.cursor/skills/<name>/SKILL.md         # thin bootloader: when-to-use, invoke, LLM slots
```

Match the surrounding script language — this repo's checks are mostly `.mjs`
(`scripts/check-*.mjs`, `doctor.mjs`), while agent-asset governance is Python
(`scripts/ci/check_agent_frontmatter.py`). Either is fine; the CLI contract is what matters:
read-only by default, `--json` for agents, non-zero exit on failure.

Author under `.cursor/` only; run `python scripts/sync_assistant_trees.py` so `.claude/` mirrors it.

## Compiled in this repo

| Skill / command | Harness | LLM slots |
|-----------------|---------|-----------|
| `changelog-commit-push`, `/release` | `scripts/agent_skills/release_bump.py` | Classify git history when Unreleased empty; draft bullets |
| `verification-before-completion` | `scripts/agent_skills/verification_before_completion.py` | Name claim; interpret whether output supports “done” |
| `validate-implementation` | `scripts/agent_skills/validate_implementation.py` | Verdict when evidence is manual/ambiguous |

```powershell
python scripts/agent_skills/release_bump.py inspect
python scripts/agent_skills/release_bump.py plan --level minor
python scripts/agent_skills/release_bump.py apply --level minor

python scripts/agent_skills/verification_before_completion.py --suite --run --json

python scripts/agent_skills/validate_implementation.py parse path/to/spec.md
python scripts/agent_skills/validate_implementation.py report path/to/spec.md --name "feature"
```

Existing deterministic scripts (`scripts/check-type-sync.mjs`,
`scripts/validate-api-types.mjs`, `scripts/doctor.mjs`, `scripts/prebuild-backup-manifest.mjs`) are
already code, not compiled skills — a compile turns a *prose skill* into one of these.

## How to compile another skill

Run [`/compile-skill <name>`](../.cursor/commands/compile-skill.md), which drives this checklist:

1. Confirm the workflow is stable (repeated traces / inventory usage).
2. Partition steps into code / LLM / human — do not freeze judgment into brittle rules.
3. Implement the harness with a read-only default and `--json`.
4. Shrink `SKILL.md` to a bootloader that points at the harness and lists judgment slots.
5. Add tests (`tests/test_agent_skills_harnesses.py` for Python harnesses).
6. Sync trees, update [SKILL_INVENTORY.md](SKILL_INVENTORY.md), run
   [AST10 review](SKILL_CHANGE_AST10_REVIEW.md).

## Measurement note

This repository does not store per-session token telemetry, so we do not claim numeric token savings.
Savings are **structural**: agents load a short bootloader and run code instead of re-deriving the
procedure from long prose. Replay harnesses against fixtures to prove behavioral parity.
