---
name: validate-implementation
description: >-
  Verify implementation against spec AC-n criteria via compiled harness. Use after
  /implement or /test-and-fix, before /pr-ready. Parses ACs and emits the report;
  LLM assigns Verified/Failed/Unknown when evidence is not a clean command exit.
---

# Validate implementation (compiled)

Thin bootloader over `scripts/agent_skills/validate_implementation.py`.

Answers: **does the implementation satisfy the spec's acceptance criteria?**
Not merge readiness — that is `/pr-ready`.

## Canonical flow

```powershell
# List ACs
python scripts/agent_skills/validate_implementation.py parse path/to/spec.md

# Skeleton report (all Unknown until evidence attached)
python scripts/agent_skills/validate_implementation.py report path/to/spec.md --name "feature"

# Attach command evidence (exit 0 → Verified, else Failed)
python scripts/agent_skills/validate_implementation.py report path/to/spec.md `
  --evidence "AC-1=npm run test:run -- src/foo.test.tsx" `
  --evidence "AC-2:Unknown:needs Electron + backend" `
  -o .agent/scratch/validation-report.md
```

## Ownership split

| Owner | Responsibility |
|-------|----------------|
| **Code** | Parse `AC-n`, render report table, run evidence commands, bound output |
| **LLM** | Verdict when evidence is manual/ambiguous; propose AC rewrites if untestable |
| **Human** | Decide whether Unknowns block merge |

## Rules (unchanged)

- Evidence or it did not happen — reading code alone is not Verified.
- Unknown is never an implicit pass.
- Do not weaken criteria; flag untestable ACs instead.
- Only claim the spec satisfied when **every** AC is Verified.
