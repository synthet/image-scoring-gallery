# Dead Code Registry (gallery)

Chronological record of confirmed orphan/dead code removed from **image-scoring-gallery**. Backend removals: [image-scoring-backend/docs/reports/DEAD_CODE_REGISTRY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/DEAD_CODE_REGISTRY.md).

**Cross-repo tracking:** [synthet/image-scoring-backend#252](https://github.com/synthet/image-scoring-backend/issues/252)

---

| Item | Path(s) | Lines (approx.) | Reason | Introduced | Orphaned / disabled | Removed |
|------|---------|-----------------|--------|------------|---------------------|---------|
| In-app Runs UI | `src/components/Runs/RunsPage.tsx`, `RunsConsole.tsx`, `src/store/useRunsStore.ts` | ~800 | No imports; scoring opens backend `/ui/runs` via `openScoringWindow` | v4.x Runs feature | [PR #62](https://github.com/synthet/image-scoring-gallery/pull/62) [`d6fe88f`](https://github.com/synthet/image-scoring-gallery/commit/d6fe88f), [`2a60bcb`](https://github.com/synthet/image-scoring-gallery/commit/2a60bcb) | #252 |
| Duplicate finder scaffold | `src/components/Duplicates/DuplicateFinder.tsx` | ~330 | Never mounted in `AppContent` | Planned Tools view | [`9485fa8`](https://github.com/synthet/image-scoring-gallery/commit/9485fa8) | #252 |
| Embeddings map scaffold | `src/components/Embeddings/EmbeddingMap.tsx` | ~110 | Placeholder; never mounted | Planned Tools view | [`9485fa8`](https://github.com/synthet/image-scoring-gallery/commit/9485fa8) | #252 |
| Dead IPC listeners | `onOpenDuplicates`, `onOpenEmbeddings`, `onOpenRuns` in `electron/preload.ts`, `src/electron.d.ts`, `src/bridge.ts` | ~40 | Main never `send()`s channels; Runs menu removed | Gradio/Electron era | PR #62, `9485fa8` | #252 |
| Firebird maintenance scripts | `scripts/add_uuids.js`, `remove_duplicates.js`, `sync_backup_uuids.js` | ~450 | `node-firebird` not in `package.json` | Firebird era | Postgres migration | #252 |
| Unused backup export | `electron/backupSpace.ts` → `removeStaleBackupFiles` | ~15 | Zero callers | Backup refactor | Superseded by `syncStaleBackupEntries` | #252 |
| Stale browser diagnostics | `src/bridge.ts` `engine: 'firebird'` | ~1 | Misleading placeholder | Browser dev mode | Firebird decommission | #252 (fixed to `postgres`) |
| Persistence view union | `galleryBrowserPersistence.ts` `duplicates`/`embeddings` | ~5 | Tools views never restored | `9485fa8` | Coerced to gallery | #252 |

### Intentionally retained

| Item | Why kept |
|------|----------|
| Server `/gallery-api/.../near-duplicates` route | API surface; only orphan React component removed |
| Generated deprecated OpenAPI paths | Contract mirror from backend; not app-called |
