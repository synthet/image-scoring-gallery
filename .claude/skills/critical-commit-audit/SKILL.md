---
name: critical-commit-audit
description: >-
  Deep bug-finding on recent commits: high-severity correctness only (data loss, crashes, security, major breakage). Trace full code paths, require a concrete trigger before a PR, minimal fixes with tests. Use when the user runs /critical-commit-audit or asks for a post-commit critical review.
---

# critical-commit-audit

You are a **deep bug-finding** automation focused on **high-severity** issues.

## Goal

Inspect **recent commits** and identify **critical** correctness bugs that escaped review. Only surface issues that would cause **data loss**, **crashes**, **security holes**, or **significant user-facing breakage**.

## Investigation strategy

- Focus on **behavioral changes** with meaningful blast radius.
- Look for: **data corruption**; **race conditions** that lose writes; **null dereferences** in critical paths; **auth/permission** bypasses; **infinite loops**; **resource leaks**; **silent data truncation**.
- **Trace through the full code path** — do not only pattern-match on the diff. Understand the **caller chain** and **downstream** effects.
- **Ignore:** style issues, minor edge cases, theoretical concerns without a concrete trigger, and low-severity issues that would merely degrade UX.

## Operational workflow (this repo)

1. **Scope commits** — Default: `git log -n 20 --oneline` (or a user-provided range, e.g. `main..HEAD`, `abc123..def456`). Prioritize **merge commits** and **large diffs**.
2. **Review** — For each changed area, read the full diff, then follow symbols to **callers** and **callees**. In an Electron app the highest-blast-radius boundaries are the **main ↔ renderer IPC contract**, the **preload bridge** (`contextIsolation` / exposed API surface), the **API client** against the sibling backend, and file-system access to user photo folders.
3. **Data and process boundaries** — If commits touch cached previews, backup manifests, or anything that writes to disk, consider ordering, partial writes, and idempotency; trace what happens on failure or retry. A renderer crash must not leave a half-written manifest.
4. **Security specifics** — Watch for `nodeIntegration` re-enabled, `contextIsolation` disabled, unvalidated IPC arguments crossing the bridge, path traversal in file handlers, and remote content loaded into a privileged window.
5. **Tests** — After any fix, run `npm run test:run` and `npm run lint`; add `node scripts/check-type-sync.mjs` and `node scripts/validate-api-types.mjs` when the change touched the API contract. Prefer **gallery-electron-ts** for minimal, scoped code changes.

## Confidence bar

- You must be able to describe a **concrete scenario** that triggers the bug (sequence of user or system actions).
- If you **cannot** construct a plausible trigger scenario, **do not** open a PR.
- If uncertain whether severity is "critical," **treat it as not PR-worthy** and report qualitatively only.

## Fix strategy

- If you find a **critical** bug, implement a **minimal, high-confidence** fix.
- **Add or update tests** when possible to lock in the behavior.
- **Avoid** broad refactors in the same PR.
- **Do not** expand scope (see project SDLC: small, focused changes).

## Safety rules

- **Do not open a PR** unless you are **highly confident** the bug is real and the fix is correct.
- If **no** critical bug is found, post a short **"no critical bugs found"** summary. This is the **expected** outcome most days.

## Output when nothing critical is found

Use a **short** paragraph, for example:

- Commits reviewed: (range or count).
- Focus areas: (modules or themes).
- Result: **No critical issues** (data loss, security, crash-class, or major breakage) identified with a concrete trigger in the paths traced.

## Output when a critical bug is fixed (include in your reply)

- **Bug and impact** — What breaks and for whom.
- **Root cause** — Why the defect exists (one tight paragraph).
- **Fix and validation performed** — What changed, which tests or checks ran, key results.

## Related skills

- [`gallery-electron-ts`](../gallery-electron-ts/SKILL.md) — scoped Electron/TS implementation
- [`security-review`](../security-review/SKILL.md) — pre-merge security sanity pass
- [`systematic-debugging`](../systematic-debugging/SKILL.md) — when the trigger scenario is not yet clear
- `/pr-ready` — merge-ready description after a fix
