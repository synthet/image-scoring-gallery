import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import type { ExifTool } from 'exiftool-vendored';
import type { ExportImageContext } from './types';

export type ExportImageDeps = {
    getMainWindow: () => BrowserWindow | null;
    getExportContext: () => ExportImageContext | null;
    showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
    exiftool: ExifTool;
};

/**
 * Re-encoded export JPEGs often still carry EXIF Orientation from the embedded preview
 * (Chromium canvas may copy it). Pixels are already upright after the renderer bake, so
 * Orientation must be 1 or viewers (e.g. Windows Photos) rotate again.
 *
 * @see docs/features/implemented/05-jpeg-export-exif-orientation.md
 */
async function resetExportedJpegExifOrientation(
    exiftool: ExifTool,
    targetPath: string,
    mimeType: string,
): Promise<void> {
    const lower = targetPath.toLowerCase();
    const isJpeg =
        mimeType.includes('jpeg') ||
        mimeType.includes('jpg') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg');
    if (!isJpeg) {
        return;
    }
    try {
        await exiftool.write(
            targetPath,
            { Orientation: 1 },
            {
                writeArgs: ['-overwrite_original', '-n'],
                useMWG: false,
                ignoreMinorErrors: true,
            },
        );
    } catch (err) {
        console.warn('[Main] Export: could not reset EXIF Orientation to 1 (non-fatal)', err);
    }
}

export async function exportCurrentImage(deps: ExportImageDeps): Promise<void> {
    const { getMainWindow, getExportContext, showSaveDialog, exiftool } = deps;
    const mainWindow = getMainWindow();
    const currentExportImageContext = getExportContext();

    if (!currentExportImageContext?.imageBytes?.length) {
        mainWindow?.webContents.send('show-notification', {
            message: 'No image preview is currently available to export.',
            type: 'warning',
        });
        return;
    }

    const defaultName = currentExportImageContext.fileName || 'export.jpg';
    const saveResult = await showSaveDialog({
        title: 'Export',
        defaultPath: defaultName,
    });

    if (saveResult.canceled || !saveResult.filePath) {
        return;
    }

    const targetPath = saveResult.filePath;
    await fs.promises.writeFile(targetPath, Buffer.from(currentExportImageContext.imageBytes));
    await resetExportedJpegExifOrientation(exiftool, targetPath, currentExportImageContext.mimeType);

    try {
        const sourcePath = currentExportImageContext.sourcePath;
        const metadata = [
            `Original Path: ${sourcePath}`,
            `Original Name: ${path.basename(sourcePath)}`,
            `Image UUID: ${currentExportImageContext.imageUuid || 'None'}`,
            `Export Date: ${new Date().toLocaleString()}`,
            `Database ID: ${currentExportImageContext.id}`,
        ].join('\n');

        if (fs.existsSync(sourcePath)) {
            console.log(`[Main] Copying EXIF from ${sourcePath} to ${targetPath}`);
            const targetTags = await exiftool.read(targetPath);
            const sourceTags = await exiftool.read(sourcePath);
            const tagsToCopy: Record<string, unknown> = {};

            const preserveTags = [
                'Make', 'Model', 'LensModel', 'ISO', 'ExposureTime', 'FNumber',
                'FocalLength', 'DateTimeOriginal', 'CreateDate', 'GPSLatitude',
                'GPSLongitude', 'GPSAltitude',
            ] as const;

            const normalized = currentExportImageContext.pixelNormalizationApplied === true;
            const p = currentExportImageContext.previewOrientation;
            const s = sourceTags.Orientation;

            tagsToCopy.Orientation = 1;

            const orientationTagsToStrip = [
                'Orientation', 'Rotation', 'AutoRotate', 'CameraOrientation',
                'ImageOrientation', 'XMP-tiff:Orientation', 'XMP-exif:Orientation',
            ];

            for (const tag of preserveTags) {
                if (sourceTags[tag as keyof typeof sourceTags] !== undefined) {
                    tagsToCopy[tag] = sourceTags[tag as keyof typeof sourceTags];
                }
            }

            for (const tag of orientationTagsToStrip) {
                delete (tagsToCopy as Record<string, unknown>)[tag];
            }
            tagsToCopy.Orientation = 1;

            console.log(
                `[Main] Export: ${path.basename(sourcePath)} | PrevOrient: ${p ?? 'None'} | RawOrient: ${s ?? 'None'} | Normalized: ${normalized} | Size: ${targetTags.ImageWidth}x${targetTags.ImageHeight} | Final: 1`,
            );

            tagsToCopy.ImageDescription = metadata;
            tagsToCopy.Description = metadata;
            tagsToCopy.XPComment = metadata;
            tagsToCopy.UserComment = metadata;

            console.log(`[Main] Writing enriched metadata to ${targetPath}`);
            await exiftool.write(targetPath, tagsToCopy, {
                writeArgs: ['-overwrite_original', '-n'],
                useMWG: false,
                ignoreMinorErrors: true,
            });
        } else {
            await exiftool.write(
                targetPath,
                {
                    ImageDescription: metadata,
                    Description: metadata,
                    XPComment: metadata,
                    UserComment: metadata,
                    Orientation: 1,
                },
                {
                    writeArgs: ['-overwrite_original', '-n'],
                    useMWG: false,
                    ignoreMinorErrors: true,
                },
            );
        }
    } catch (exifErr) {
        console.error('[Main] Metadata enrichment failed:', exifErr);
    }

    mainWindow?.webContents.send('show-notification', {
        message: `Image exported to:\n${targetPath}`,
        type: 'success',
    });
}
