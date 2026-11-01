import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import type { ExifTool } from 'exiftool-vendored';
import type { ExportImageContext, ExportExifResult } from './types';
import { toWindowsLocalFsPath } from './pathWinWsl';

export type ExportExifDeps = {
    getMainWindow: () => BrowserWindow | null;
    getExportContext: () => ExportImageContext | null;
    getSelectionPath: () => string | null;
    showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
    exiftool: ExifTool;
};

/**
 * Export full EXIF / MakerNotes metadata from the currently viewed or selected image.
 * Supports exporting to structured JSON, human-readable Text dump, or Markdown summary.
 */
export async function exportImageExif(
    deps: ExportExifDeps,
    explicitPath?: string,
): Promise<ExportExifResult> {
    const { getMainWindow, getExportContext, getSelectionPath, showSaveDialog, exiftool } = deps;
    const mainWindow = getMainWindow();

    let targetSource = explicitPath;
    if (!targetSource) {
        targetSource = getExportContext()?.sourcePath || getSelectionPath() || undefined;
    }

    if (!targetSource) {
        mainWindow?.webContents.send('show-notification', {
            message: 'No image is currently selected to export EXIF metadata.',
            type: 'warning',
        });
        return { success: false, error: 'No image selected' };
    }

    const resolvedSource = toWindowsLocalFsPath(targetSource);

    if (!fs.existsSync(resolvedSource)) {
        mainWindow?.webContents.send('show-notification', {
            message: `Source image file not found on disk:\n${resolvedSource}`,
            type: 'error',
        });
        return { success: false, error: `File not found: ${resolvedSource}` };
    }

    const baseName = path.basename(resolvedSource, path.extname(resolvedSource));
    const defaultDir = path.dirname(resolvedSource);
    const defaultSaveName = `${baseName}-exif.json`;

    const saveResult = await showSaveDialog({
        title: 'Export EXIF Metadata',
        defaultPath: path.join(defaultDir, defaultSaveName),
        filters: [
            { name: 'JSON Metadata (*.json)', extensions: ['json'] },
            { name: 'Text Report (*.txt)', extensions: ['txt'] },
            { name: 'Markdown Summary (*.md)', extensions: ['md'] },
            { name: 'All Files (*.*)', extensions: ['*'] },
        ],
    });

    if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: 'Export cancelled' };
    }

    const outPath = saveResult.filePath;
    const ext = path.extname(outPath).toLowerCase();

    try {
        console.log(`[Main] Exporting full EXIF from ${resolvedSource} to ${outPath}`);
        const tags = await exiftool.read(resolvedSource, [
            '-a',
            '-u',
            '-U',
            '-ee3',
            '-api',
            'RequestAll=3',
        ]);

        const stat = await fs.promises.stat(resolvedSource);

        // Check companion sidecars in same directory
        const dir = path.dirname(resolvedSource);
        const dopPath = path.join(dir, `${path.basename(resolvedSource)}.dop`);
        const dopAltPath = path.join(dir, `${baseName}.dop`);
        const xmpPath = path.join(dir, `${baseName}.xmp`);
        const hasDop = fs.existsSync(dopPath) || fs.existsSync(dopAltPath);
        const hasXmp = fs.existsSync(xmpPath);

        const tagsRecord = tags as Record<string, unknown>;

        if (ext === '.txt' || ext === '.md') {
            const camera = [tagsRecord.Make, tagsRecord.Model].filter(Boolean).join(' ') || 'Unknown Camera';
            const lens = String(tagsRecord.LensModel || tagsRecord.Lens || tagsRecord.LensID || 'Unknown Lens');
            const exposure = String(tagsRecord.ExposureTime || tagsRecord.ShutterSpeed || 'Unknown');
            const aperture = tagsRecord.FNumber ? `f/${tagsRecord.FNumber}` : (tagsRecord.Aperture ? `f/${tagsRecord.Aperture}` : 'Unknown');
            const iso = String(tagsRecord.ISO || 'Unknown');
            const focal = String(tagsRecord.FocalLength || 'Unknown');
            const wb = String(tagsRecord.WhiteBalance || 'Unknown');
            const dtOriginal = String(tagsRecord.DateTimeOriginal || 'Unknown');

            const lines: string[] = [
                `# EXIF Metadata Export: ${path.basename(resolvedSource)}`,
                '',
                `- **File:** \`${resolvedSource}\``,
                `- **File Size:** ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size.toLocaleString()} bytes)`,
                `- **Modified:** ${stat.mtime.toISOString()}`,
                `- **Exported:** ${new Date().toISOString()}`,
                `- **Sidecars:** DxO .dop: ${hasDop ? 'Yes' : 'No'} | Lightroom .xmp: ${hasXmp ? 'Yes' : 'No'}`,
                '',
                '## Key Technical Parameters',
                `- **Camera:** ${camera}`,
                `- **Lens:** ${lens}`,
                `- **Exposure:** ${exposure}`,
                `- **Aperture:** ${aperture}`,
                `- **ISO:** ${iso}`,
                `- **Focal Length:** ${focal}`,
                `- **White Balance:** ${wb}`,
                `- **Date/Time Original:** ${dtOriginal}`,
                '',
                '## Complete Extracted Tags',
                '```',
            ];

            for (const [k, v] of Object.entries(tagsRecord)) {
                if (v !== undefined && v !== null && typeof v !== 'function') {
                    const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
                    lines.push(`${k}: ${valStr}`);
                }
            }
            lines.push('```');
            await fs.promises.writeFile(outPath, lines.join('\n'), 'utf-8');
        } else {
            const payload = {
                provenance: {
                    sourcePath: resolvedSource,
                    fileName: path.basename(resolvedSource),
                    fileSizeBytes: stat.size,
                    mtime: stat.mtime.toISOString(),
                    exportedAt: new Date().toISOString(),
                    sidecars: {
                        dop: hasDop,
                        xmp: hasXmp,
                    },
                },
                summary: {
                    camera: [tagsRecord.Make, tagsRecord.Model].filter(Boolean).join(' ') || undefined,
                    lens: (tagsRecord.LensModel || tagsRecord.Lens || tagsRecord.LensID) as string | undefined,
                    exposure: (tagsRecord.ExposureTime || tagsRecord.ShutterSpeed) as string | undefined,
                    fNumber: (tagsRecord.FNumber || tagsRecord.Aperture) as number | string | undefined,
                    iso: tagsRecord.ISO as number | undefined,
                    focalLength: tagsRecord.FocalLength as string | undefined,
                    whiteBalance: tagsRecord.WhiteBalance as string | undefined,
                    dateTimeOriginal: tagsRecord.DateTimeOriginal as string | undefined,
                },
                tags: tagsRecord,
            };
            await fs.promises.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf-8');
        }

        mainWindow?.webContents.send('show-notification', {
            message: `EXIF metadata exported to:\n${outPath}`,
            type: 'success',
        });

        return { success: true, filePath: outPath };
    } catch (err: unknown) {
        console.error('[Main] Export EXIF failed:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        mainWindow?.webContents.send('show-notification', {
            message: `Failed to export EXIF metadata:\n${errMsg}`,
            type: 'error',
        });
        return { success: false, error: errMsg };
    }
}
