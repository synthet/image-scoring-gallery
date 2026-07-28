---
name: verification-before-completion
description: >-
  Use before claiming work is complete, fixed, passing, ready to commit, or ready
  for PR. Runs scripts/agent_skills/verification_before_completion.py for the
  claim→proof catalog; LLM interprets output. Never upgrade incomplete verification.
---

# Verification before completion (compiled harness)

Do not claim done/fixed/passing/ready until fresh command output supports the claim.

## Invoke

```bash
# List catalog
python scripts/agent_skills/verification_before_completion.py --json

# Run selected proofs
python scripts/agent_skills/verification_before_completion.py \
  --claim assets_synced --claim frontmatter_ok --run --json

# Agent-infra verify suite
python scripts/agent_skills/verification_before_completion.py --suite --run --json

# App claims (examples)
python scripts/agent_skills/verification_before_completion.py \
  --claim tsc_renderer --claim tsc_electron --claim tests_pass --run --json
```

## LLM judgment slots

1. **Name the claim** and pick the falsifying proof (catalog ids or custom command).
2. **Interpret output** after the final edit — exit code, warnings, skipped tests, scope.
3. Report pass / warn / fail with the exact command; never upgrade incomplete verification to pass.

## Human authority

Consequential ship / merge decisions stay with the user.

## Use with

- `validate-implementation` when an AC matrix is required
- `changelog-commit-push` before shipping (gallery)
