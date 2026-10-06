---
type: "Implemented Feature"
title: "JPEG export and EXIF orientation"
description: "Purpose: Document why File → Export must produce a JPEG whose pixels match the on-screen preview and whose EXIF Orientation is 1 (or absent), so system viewers (e.g. Windows Photos"
resource: "docs/features/implemented/05-jpeg-export-exif-orientation.md"
tags: ["features", "gallery-docs", "implemented"]
timestamp: 2026-10-05T00:00:00Z
---

# JPEG export and EXIF orientation

**Purpose:** Document why **File → Export** must produce a JPEG whose **pixels** match the on-screen preview and whose **EXIF Orientation is 1** (or absent), so system viewers (e.g. Windows Photos) do not apply a second rotation.

**Primary code:** [`src/utils/exportImageBake.ts`](../../../src/utils/exportImageBake.ts) (renderer bake), [`src/components/Viewer/ImageViewer.tsx`](../../../src/components/Viewer/ImageViewer.tsx) (builds export payload from the same preview bytes), [`electron/main.ts`](../../../electron/main.ts) (`exportCurrentImage`, `resetExportedJpegExifOrientation`).

**Related:** NEF embedded previews — [`01-nef-raw-fallback.md`](01-nef-raw-fallback.md); backend embedded preview transpose — [`modules/ui/source_image_api.py`](https://github.com/synthet/image-scoring-backend/blob/main/modules/ui/source_image_api.py) (`ImageOps.exif_transpose` on RAW preview path).

---

## Symptoms of a regression

- Exported `.jpg` appears **rotated or flipped** (often **180°**) compared to the same image in the gallery, while the **source RAW/JPEG** looks correct in-app.
- Inspecting the export with ExifTool or PIL shows **EXIF Orientation 2–8** even though the bitmap already looks “upright” in a canvas-based workflow.

---

## Root causes (two layers)

### 1. Renderer: double application of orientation

Embedded previews (especially from **Nikon Z8** and similar) ship a JPEG with **EXIF Orientation ≠ 1** and pixel data in **sensor/storage** layout.

- If the decoder **already** applies orientation (e.g. `createImageBitmap` with `imageOrientation: 'from-image'`, or an `<img>` that auto-orients) and the code **also** applies a manual `applyOrientationTransform` for the same tag, pixels are wrong (**double correction**).
- Chromium can return already oriented pixels even when requested with `imageOrientation: 'none'`. Treating those dimensions as storage dimensions and applying a matrix rotates the image again.

**Invariant:** Orientation must be applied **exactly once**. Decode with `from-image` and draw the browser's upright pixels directly. Apply a manual matrix only when a client-extracted RAW preview has no non-1 JPEG orientation and needs the source TIFF IFD0 orientation. [`nefViewer.ts`](../../../src/utils/nefViewer.ts) supplies this fallback for both SubIFD and JPEG marker extraction.

The Electron extractor stamps numeric source orientation using ExifTool's `-n` option. Without numeric mode, writing `8` can be interpreted as a description and become Orientation `3`.

### 2. Main process: metadata contradicting pixels

Canvas output has upright pixels and normally has no EXIF orientation. Copying source camera metadata into that output can reintroduce Orientation **3** (or any value ≠ 1), causing viewers that honor EXIF to rotate it again.

**Invariant:** After writing export bytes, **force EXIF Orientation to 1** in a **dedicated** ExifTool pass (`resetExportedJpegExifOrientation`): numeric (`-n`), **`useMWG: false`** for predictable behavior, **`ignoreMinorErrors: true`**, before or independent of heavier “copy camera tags from source” enrichment. Enrichment writes should also use **`useMWG: false`** and must **not** reintroduce a non-1 orientation from the NEF.

---

## Implementation checklist (avoid regressions)

| Area | Do | Don’t |
|------|----|--------|
| Parser | Keep a **large enough** initial read for `getJpegOrientation` (embedded previews may put **XMP APP1 before EXIF APP1**). | Assume orientation is in the first APP1 segment only. |
| Bake | Decode with **`createImageBitmap(blob, { imageOrientation: 'from-image' })`**; the `<img>` fallback also uses browser orientation. | Assume **`none`** disables Chromium orientation, or apply the JPEG's EXIF matrix again. |
| Bake | Use decoded dimensions directly. Swap dimensions for **5–8** only when applying missing RAW orientation. | Swap an already oriented bitmap's dimensions. |
| RAW preview | Use source TIFF orientation only if the extracted JPEG has no non-1 orientation; bake client fallbacks before display. Stamp Electron preview tags with numeric **`-n`**. | Apply both the JPEG tag and the source TIFF tag to the same pixels. |
| Main | Call **`resetExportedJpegExifOrientation`** immediately after **`writeFile`** for JPEG exports. | Rely only on a single metadata merge pass that might fail or preserve old Orientation. |
| Main | Set **`Orientation: 1`** in enrichment **`tagsToCopy`**; never copy orientation from the RAW into the export. | Use **`useMWG: true`** for these writes unless you fully understand MWG/XMP orientation sync. |

---

## Verification

1. Export a **NEF** known to have **Orientation 3** (or 6) in the embedded preview; compare gallery vs exported JPG in **Windows Photos**.
2. `python -c "from PIL import Image; print(Image.open('export.jpg').getexif().get(274))"` → expect **`1`** or **`None`**, not **3** / **6** with wrong-looking pixels.
3. Compare Electron and browser fallback previews for Orientation **8**: Z8 `DSC_9144.NEF`, Z6ii `DSC_5416.NEF` and `DSC_5203.NEF`. Include backend image **240203** (`DSC_5415.NEF`) as a regression sample; its original and backend thumbnail must remain unchanged.

### Regression evidence (2026-10-05)

The running Electron renderer decoded real source files through both IPC extraction and the browser TIFF/marker fallback. Canvas outputs were visually upright and had no remaining orientation tag:

| Source | Electron output | Browser fallback output |
|--------|-----------------|-------------------------|
| Z8 `DSC_9144.NEF` | 3592 × 5392 | 3592 × 5392 |
| Z6ii `DSC_5416.NEF` | 4024 × 6048 | 4024 × 6048 |
| Z6ii `DSC_5203.NEF` | 4024 × 6048 | 4024 × 6048 |
| Z6ii `DSC_5415.NEF` (image 240203) | 4024 × 6048 | 4024 × 6048 |

The backend detail page's `/source-image` response for image 240203 also decoded upright at 4024 × 6048 (HTTP 200). Its source and existing thumbnail retained identical SHA-256 hashes before and after verification. Verification used the served image bytes; no automated screenshot of the backend page was available.

Focused verification: 56 tests across `exportImageBake`, its transforms and JPEG parser, `nefViewer`, `ImageViewer`, and `nefExtractor`; renderer TypeScript and touched-file ESLint passed. The companion backend thumbnail regression test also passed.

## Grid thumbnails and recovery

The companion backend's `modules/thumbnails.py` previously saved raster sources without retaining their EXIF orientation. It now applies `ImageOps.exif_transpose` before resizing/saving non-RAW thumbnails, so the saved pixels are upright. RAW thumbnail handling remains unchanged.

Existing generated JPEG thumbnails need regeneration: deploying the code does not rewrite cached files. During this investigation, 41 affected generated JPEG thumbnails in the Z8 28–400mm session from 2026-10-03 were repaired; originals were not modified. Regenerate only affected derived thumbnails, then reload the gallery to clear cached preview object URLs. A full Electron restart is required when the extractor's main-process code changes.

## Diagnostic tools

LibRaw's `raw-identify` sample tool was useful for checking LibRaw's interpretation of the NEF orientation. LibRaw's `dcraw_emu` provides an alternate RAW decoder, but this fix uses the existing ExifTool and browser/Pillow decoders and adds no new decoder dependency.

If development startup reports missing `mcp-server/dist/liveServer.js`, run `npm install` followed by `npm run build:registry` in `mcp-server`, then restart Electron. This optional MCP artifact is independent of image orientation.

---

## Changelog reference

Ship behavior and history: root [`CHANGELOG.md`](../../../CHANGELOG.md) (search **JPEG export** / **orientation**).
