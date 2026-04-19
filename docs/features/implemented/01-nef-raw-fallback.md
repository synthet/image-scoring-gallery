# NEF/RAW Fallback (Normative Behavior)

## Purpose

This feature defines how NEF (Nikon RAW) preview extraction must behave in the Electron gallery when rendering a preview image.

The goal is reliability first: the system should attempt higher-fidelity extraction paths first, then degrade gracefully if any tier fails.

## Tier Sequence (Required)

The extraction flow is a strict ordered fallback pipeline:

1. **Tier 1: ExifTool-based extraction (main process)**
   - Attempt preview extraction through the ExifTool integration in the Electron main process.
   - If Tier 1 returns a valid preview payload, extraction stops and that payload is used.

2. **Tier 2: SubIFD parser (renderer/client-side)**
   - If Tier 1 fails or returns no usable preview, the renderer must attempt SubIFD-based parsing from the NEF buffer.
   - If Tier 2 succeeds, extraction stops and that payload is used.

3. **Tier 3: JPEG marker scan fallback (renderer/client-side)**
   - If Tier 2 fails or returns no usable preview, the renderer must attempt marker-scan extraction.
   - Tier 3 is the final fallback path.

If all tiers fail, the operation must surface a controlled error to the caller/UI (not an unhandled exception).

## Fallback Semantics (Required)

- **Fail-open between tiers:** A failure in one tier is not terminal while lower-priority tiers remain.
- **Single winner:** The first successful tier becomes the canonical extraction result for that request.
- **Deterministic order:** Tiers must not run out of order.
- **No silent total failure:** If all tiers fail, emit an explicit failure state with actionable logging.

## Expected Logs

The following log progression is expected during normal fallback operation:

```text
[NefExtractor] Attempting exiftool extraction for: <path>
[NefExtractor] ✗ Tier 1 failed: <error>
[Main] Tier 1 failed, falling back to client-side extraction
[NefViewer] Tier 1 failed, trying client-side fallbacks
[NefViewer] ✓ Tier 2 succeeded (SubIFD parsing)
```

Additional notes:
- If Tier 1 succeeds, renderer fallback logs should not appear for that request.
- If Tier 2 fails and Tier 3 is attempted, logs should indicate Tier 2 failure and Tier 3 attempt/success/failure explicitly.

## Known Limitations

- **Tier 1 runtime sensitivity:** ExifTool-based extraction can be affected by runtime packaging/path/permission issues in some environments.
- **Quality variability by tier:** Tier 2 and Tier 3 may return different preview quality/dimensions depending on embedded NEF data.
- **Performance overhead on fallback:** Failed higher tiers add small latency before a lower tier succeeds.
- **Format variance:** NEF files from different camera generations may expose different embedded preview characteristics.

These limitations are expected and do not invalidate the fallback contract above.

## Dependency/Version Policy

This document is intentionally **version-agnostic**:
- Do not hardcode dependency patch versions in normative behavior docs.
- If exact versions are needed for incident/debug context, record them in dated reports under `docs/reports/`.

## Verification References

Behavior is verified by unit tests in:
- [`electron/nefExtractor.test.ts`](../../../electron/nefExtractor.test.ts)
- [`src/utils/nefViewer.test.ts`](../../../src/utils/nefViewer.test.ts)

## Related Historical Context

- Incident snapshot moved to: [`docs/reports/05-nef-raw-fallback-incident-2026-04-19.md`](../../reports/05-nef-raw-fallback-incident-2026-04-19.md)
