# Testing and Coverage Guide

This project uses Vitest for unit/integration tests and V8 coverage reporting.

## Run tests

- Run the full suite once (non-watch):

```bash
npm run test:run
```

- Run tests with coverage output for CI and local baselines:

```bash
npm run test:coverage
```

## Coverage outputs (CI-friendly)

`npm run test:coverage` now emits multiple reporter formats under `coverage/`:

- `text` + `text-summary`: readable output in CI logs
- `json-summary`: machine-readable totals for tooling/baseline capture
- `lcov`: artifact-friendly format for CI systems and coverage dashboards
- `html`: interactive local inspection report

## Threshold policy (conservative baseline, ratchet upward)

Current coverage thresholds are intentionally conservative so they reflect the current suite health while still preventing regressions.

- Branches: `6%`
- Functions: `8%`
- Lines: `10%`
- Statements: `10%`

### How to interpret failures

A threshold failure means the measured total dropped below one or more configured minimums. This is usually a signal that:

1. New code was added without tests, or
2. Existing tests were removed/changed and no longer execute previously covered paths.

### When and how to raise thresholds

After capturing a stable baseline (for example from main branch CI):

1. Record totals from `coverage/coverage-summary.json`.
2. Increase one or more thresholds in `vitest.config.ts` by a small increment (typically `+1%` to `+3%`).
3. Run `npm run test:coverage` and ensure CI passes.
4. Repeat periodically as meaningful test coverage improves.

Avoid lowering thresholds except for explicit, reviewed reasons (for example large refactors with temporary coverage disruption).

[← Back to Guides](README.md)
