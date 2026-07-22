---
name: verification-before-completion
description: >-
  Use before claiming work is complete, fixed, passing, ready to commit, or ready
  for PR. Apply to ensure fresh command output supports every success claim and to
  report warnings or failures honestly.
---

# Verification before completion

Do not claim done/fixed/passing/ready until fresh command output supports the claim.

## Preferred proofs (gallery)

```bash
python scripts/sync_assistant_trees.py --check
python scripts/ci/check_agent_frontmatter.py
python scripts/validate_cli_hub_skills.py
npm run lint
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npm run test:run
git status --short
```

## LLM judgment slots

1. **Name the claim** and pick the falsifying proof.
2. **Interpret output** after the final edit — exit code, warnings, skipped tests, scope.
3. Report pass / warn / fail with the exact command; never upgrade incomplete verification to pass.

## Use with

- `validate-implementation` when an AC matrix is required
- `changelog-commit-push` before shipping (gallery)
