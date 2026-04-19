# NEF Extraction Tier-1 Failure Incident (2026-04-19)

## Incident Summary

This note preserves the previous implementation-facing analysis that had been stored in `docs/features/implemented/01-nef-raw-fallback.md`.

At the time of investigation, the NEF extraction system remained functional due to fallback behavior, despite Tier 1 failures.

## System Status at Time of Incident

✅ **System Status**: Functional
- 🟢 Electron app running
- 🟢 `exiftool-vendored` installed
- 🟢 Multi-tier fallback working
- 🟡 Tier 1 (ExifTool) failing → Falling back to Tier 2
- 🟢 **Tier 2 (SubIFD Parser) delivering high-resolution previews**

## Test Results Recap (Incident Snapshot)

From quality testing performed during the incident window:

| Tier | Success Rate | Quality | Status |
|------|--------------|---------|--------|
| Tier 1 (exiftool-vendored) | ❌ 0/3 (0%) | - | Failing |
| Tier 2 (SubIFD Parser) | ✅ 3/3 (100%) | High | Working |
| Tier 3 (Marker Scan) | ✅ 3/3 (100%) | Lower | Fallback |

## Suspected Tier 1 Failure Causes (At Time of Incident)

1. **ExifTool binary not found**
   - `exiftool-vendored` requires an ExifTool binary and may fail if not extracted or accessible in Electron runtime.

2. **Path issues**
   - ExifTool may not be on an expected path, or binary permissions may be incorrect.

3. **Electron packaging issues**
   - Binary inclusion or ASAR behavior may interfere with binary execution.

4. **Camera format support mismatch**
   - Considered possible but lower probability relative to runtime/packaging issues.

## Diagnostic Logs Observed/Expected

```text
[NefExtractor] Attempting exiftool extraction for: <path>
[NefExtractor] ✗ Tier 1 failed: <error message>
[Main] Tier 1 failed, falling back to client-side extraction
[NefViewer] Tier 1 failed, trying client-side fallbacks
[NefViewer] ✓ Tier 2 succeeded (SubIFD parsing)
```

Potential error strings during investigation included:
- `exiftool not found`
- `ENOENT`
- `Permission denied`
- `No preview available`

## User Impact Assessment

### ✅ No blocking user-facing issue

Even with Tier 1 failures:
- previews still loaded,
- fallback extraction succeeded,
- output quality remained acceptable for gallery use.

### 🟡 Minor performance overhead

The failed Tier 1 attempt introduced extra work before Tier 2 succeeded (IPC + fallback processing).

## Candidate Actions Considered

1. **Accept current behavior** (recommended during incident): rely on Tier 2 while preserving Tier 1 for future recovery.
2. **Fix Tier 1**: add detailed diagnostics around ExifTool runtime and packaging.
3. **Remove Tier 1**: simplify flow to client-side tiers only.

## Incident Outcome

The system was considered production-usable because fallback behavior maintained successful NEF preview extraction.

---

For current expected behavior, see the normative feature specification:
- [`docs/features/implemented/01-nef-raw-fallback.md`](../features/implemented/01-nef-raw-fallback.md)
