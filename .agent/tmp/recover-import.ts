/**
 * One-off recovery: import NEF files that were copied to D:\Photos but never
 * indexed (stranded by the sync below-threshold quick-skip bug). Mirrors the
 * import phase of runSyncFromSource in electron/main.ts.
 *
 * Run:  npx tsx .agent/tmp/recover-import.ts            (dry-run)
 *       npx tsx .agent/tmp/recover-import.ts --apply    (perform import)
 */
import path from 'path';
import fs from 'fs';
import { ExifTool } from 'exiftool-vendored';
import * as db from '../../electron/db';
import { ApiService } from '../../electron/apiService';
import { scheduleProcessingForImages } from '../../electron/scheduleProcessing';
import { loadAppConfig, getConfigPath } from '../../electron/config';

const APPLY = process.argv.includes('--apply');

const TARGET_DIRS = [
    'D:\\Photos\\Z8\\180-600mm\\2026\\2026-06-06',
    'D:\\Photos\\Z8\\105mm\\2026\\2026-06-07',
];

function listNef(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.nef'))
        .map((f) => path.join(dir, f));
}

async function main() {
    const exiftool = new ExifTool({ maxProcs: 6 });
    const apiService = new ApiService(() => loadAppConfig(getConfigPath(path.join(process.cwd(), 'electron')))) as ApiService;

    const files = TARGET_DIRS.flatMap(listNef);
    console.log(`[Recover] ${APPLY ? 'APPLY' : 'DRY-RUN'} — found ${files.length} NEF on disk across ${TARGET_DIRS.length} folders`);

    const deletedKeys = await db.getDeletedImageKeys();

    let imported = 0;
    let alreadyIndexed = 0;
    let tombstoned = 0;
    const errors: string[] = [];
    const newImageIdsByFolder = new Map<string, number[]>();

    for (const destFileAbs of files) {
        const fn = path.basename(destFileAbs);
        const ft = path.extname(destFileAbs).toLowerCase().replace(/^\./, '') || 'unknown';
        const folderPath = path.dirname(destFileAbs);
        try {
            if (await db.findImageByFilePath(destFileAbs)) { alreadyIndexed++; continue; }

            let uuid: string | null = null;
            try {
                const tags = await exiftool.read(destFileAbs);
                const uid = tags.ImageUniqueID ?? tags.DocumentID ?? null;
                if (uid && typeof uid === 'string') uuid = uid;
            } catch { /* proceed without UUID */ }

            if (uuid && await db.findImageByUuid(uuid)) { alreadyIndexed++; continue; }

            // Respect deleted_images tombstones (don't resurrect)
            const uuidNameKey = uuid ? `${uuid} ${fn.toLowerCase()}` : null;
            const isTombstoned =
                (uuidNameKey !== null && deletedKeys.uuidNameKeys.has(uuidNameKey)) ||
                deletedKeys.originalPaths.has(db.normalizePathForDb(destFileAbs)) ||
                deletedKeys.originalPaths.has(destFileAbs.replace(/\\/g, '/'));
            if (isTombstoned) { tombstoned++; continue; }

            if (!APPLY) { imported++; continue; }

            const folderId = await db.getOrCreateFolder(folderPath);
            const newImageId = await db.insertImage({
                file_path: destFileAbs,
                file_name: fn,
                file_type: ft,
                folder_id: folderId,
                image_uuid: uuid,
            });
            try { await db.markImageIndexingPhaseDone(newImageId); }
            catch (e) { console.warn('[Recover] markImageIndexingPhaseDone failed:', e); }

            const list = newImageIdsByFolder.get(folderPath) ?? [];
            list.push(newImageId);
            newImageIdsByFolder.set(folderPath, list);
            imported++;
        } catch (e) {
            errors.push(`${fn}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    console.log(`[Recover] ${APPLY ? 'imported' : 'would import'}: ${imported}, already indexed: ${alreadyIndexed}, tombstoned skipped: ${tombstoned}, errors: ${errors.length}`);
    if (errors.length) console.log('[Recover] errors:\n' + errors.slice(0, 20).map((e) => '  ' + e).join('\n'));

    if (APPLY) {
        for (const [fp, ids] of newImageIdsByFolder) {
            const res = await scheduleProcessingForImages(apiService, { folderPath: fp, imageIds: ids });
            console.log(`[Recover] schedule ${path.basename(fp)} (${ids.length} imgs):`, res);
        }
    }

    await exiftool.end();
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
