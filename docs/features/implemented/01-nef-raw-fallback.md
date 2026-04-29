# NEF/RAW preview fallback

**Purpose:** Show **Nikon NEF** and other RAW files in the desktop viewer when a normal bitmap path is unavailable, using a tiered strategy (embedded preview, LibRaw/exiftool paths, then backend JPEG).

**User-visible behavior:** Thumbnails and full view prefer fast embedded JPEGs; the app may call the Python **`GET /api/raw-preview`** (via `ApiService.getRawPreview`) or **`GET /source-image`** for transcoded bytes; local **IPC** `nef:extract-preview` / `nef:read-exif` / `fs:read-image-metadata` support offline or hybrid flows.

**Primary code paths:** `electron/main.ts` (NEF handlers, `exiftool` / `nefExtractor`), `electron/apiService.ts` (`getRawPreview`, `getSourceImage`), viewer components under `src/components/Viewer/`.

**Related docs:** Backend [INBROWSER_RAW_PREVIEW.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/INBROWSER_RAW_PREVIEW.md) · [RAW_PROCESSING_GUIDE.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/RAW_PROCESSING_GUIDE.md) · [import-discovery-alignment.md](../../architecture/import-discovery-alignment.md) (how gallery Import relates to backend Discovery)

**See also:** [Implemented features index](INDEX.md)
