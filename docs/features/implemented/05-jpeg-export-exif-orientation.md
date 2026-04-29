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
- If **non-1** orientation is detected but the code falls back from `imageOrientation: 'none'` to **`from-image`** and still runs the manual transform, you get the same bug.

**Invariant:** For a given decode path, orientation must be applied **exactly once** — either fully by the browser (`from-image` only, no manual matrix) or fully by us (`none` + manual transform). The current logic uses **`decodedWithFromImage`** (and related branching) so manual transforms never run on `from-image` pixels.

### 2. Main process: metadata contradicting pixels

**Chromium** `canvas.toBlob('image/jpeg')` can emit a new JPEG that still carries **EXIF Orientation** from the decoded source. The renderer may have **baked** upright pixels, but if **Orientation** remains **3** (or any value ≠ 1), viewers that honor EXIF will **rotate again** → export looks wrong vs the gallery.

**Invariant:** After writing export bytes, **force EXIF Orientation to 1** in a **dedicated** ExifTool pass (`resetExportedJpegExifOrientation`): numeric (`-n`), **`useMWG: false`** for predictable behavior, **`ignoreMinorErrors: true`**, before or independent of heavier “copy camera tags from source” enrichment. Enrichment writes should also use **`useMWG: false`** and must **not** reintroduce a non-1 orientation from the NEF.

---

## Implementation checklist (avoid regressions)

| Area | Do | Don’t |
|------|----|--------|
| Parser | Keep a **large enough** initial read for `getJpegOrientation` (embedded previews may put **XMP APP1 before EXIF APP1**). | Assume orientation is in the first APP1 segment only. |
| Bake | When `Orientation > 1`, prefer **`createImageBitmap(blob, { imageOrientation: 'none' })`** + **`applyOrientationTransform`**; track **`decodedWithFromImage`** so manual transform is skipped after **`from-image`**. | Chain **`from-image`** decode and manual EXIF matrix for the same file. |
| Bake | Size the canvas using raw bitmap dimensions; swap width/height for orientations **5–8** before drawing. | Use display dimensions from a pre-oriented decode when the manual path expects storage dimensions. |
| Main | Call **`resetExportedJpegExifOrientation`** immediately after **`writeFile`** for JPEG exports. | Rely only on a single metadata merge pass that might fail or preserve old Orientation. |
| Main | Set **`Orientation: 1`** in enrichment **`tagsToCopy`**; never copy orientation from the RAW into the export. | Use **`useMWG: true`** for these writes unless you fully understand MWG/XMP orientation sync. |

---

## Verification

1. Export a **NEF** known to have **Orientation 3** (or 6) in the embedded preview; compare gallery vs exported JPG in **Windows Photos**.
2. `python -c "from PIL import Image; print(Image.open('export.jpg').getexif().get(274))"` → expect **`1`** or **`None`**, not **3** / **6** with wrong-looking pixels.

---

## Changelog reference

Ship behavior and history: root [`CHANGELOG.md`](../../../CHANGELOG.md) (search **JPEG export** / **orientation**).
