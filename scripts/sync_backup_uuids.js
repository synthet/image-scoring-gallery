const Firebird = require('node-firebird');
const fs = require('fs');
const path = require('path');
const { loadMergedConfig } = require('./load-config.cjs');
const { exiftool } = require('exiftool-vendored');

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Usage: node sync_backup_uuids.js <original_path_prefix> <backup_path_prefix>");
    console.error("Example: node sync_backup_uuids.js D:/Photos E:/Backups/Photos");
    process.exit(1);
}

const originalPrefix = args[0].replace(/\\/g, '/');
const backupPrefix = args[1].replace(/\\/g, '/');

console.log(`Mapping original prefix '${originalPrefix}' to backup prefix '${backupPrefix}'`);

async function main() {
    console.log("Starting Backup UUID Sync Script...");

    // 1. Load config (config.json merged with environment.json)
    const projectRoot = path.resolve(__dirname, '..');
    const config = loadMergedConfig(projectRoot);
    const dbConfig = config.database || {};

    let rawDbPath = dbConfig.path || '../image-scoring-backend/SCORING_HISTORY.FDB';
    const dbPath = path.isAbsolute(rawDbPath)
        ? rawDbPath
        : path.resolve(__dirname, '..', rawDbPath);

    const options = {
        host: dbConfig.host || '127.0.0.1',
        port: dbConfig.port || 3050,
        database: dbPath,
        user: dbConfig.user || 'sysdba',
        password: dbConfig.password || 'masterkey',
        lowercase_keys: true,
        role: '',
        pageSize: 4096
    };

    const db = await new Promise((resolve, reject) => {
        Firebird.attach(options, (err, db) => {
            if (err) reject(err);
            else resolve(db);
        });
    });

    try {
        // Find all images that have a UUID
        const images = await new Promise((resolve, reject) => {
            db.query('SELECT file_path, file_name, image_uuid FROM images WHERE image_uuid IS NOT NULL', [], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        console.log(`Found ${images.length} images with UUIDs in the database.`);

        let processedCount = 0;
        let errorCount = 0;
        let notFoundCount = 0;
        const concurrencyLimit = 10;
        let activePromises = [];

        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const uuid = img.image_uuid || img.IMAGE_UUID;
            let origPath = img.file_path || img.FILE_PATH;

            if (!origPath || !uuid) continue;

            // Normalize slashes
            origPath = origPath.replace(/\\/g, '/');

            // Convert WSL paths like /mnt/d/... to D:/... if needed
            if (origPath.match(/^\/?mnt\/[a-zA-Z]\//)) {
                origPath = origPath.replace(/^\/?mnt\/([a-zA-Z])\//, (match, drive) => `${drive.toUpperCase()}:/`);
            }

            // Check if this path matches the prefix we want to replace
            if (!origPath.toLowerCase().startsWith(originalPrefix.toLowerCase())) {
                continue;
            }

            // Create the backup path
            const suffix = origPath.substring(originalPrefix.length);
            const backupPath = path.join(backupPrefix, suffix);

            const promise = (async () => {
                if (!fs.existsSync(backupPath)) {
                    notFoundCount++;
                    return;
                }

                try {
                    // Check if it already has the UUID to avoid redundant writes
                    const tags = await exiftool.read(backupPath);
                    if (tags.ImageUniqueID === uuid) {
                        // Already correct
                        processedCount++;
                        return;
                    }

                    // Update main file
                    await exiftool.write(
                        backupPath,
                        { ImageUniqueID: uuid },
                        ["-xmp:ImageUniqueID=" + uuid, "-overwrite_original", "-quiet"]
                    );

                    // Update sidecar XMP if it exists
                    const xmpPath = backupPath + '.xmp';
                    if (fs.existsSync(xmpPath)) {
                        await exiftool.write(xmpPath, {}, ["-xmp:ImageUniqueID=" + uuid, "-overwrite_original", "-quiet"]);
                    }
                } catch (exifErr) {
                    console.error(`\nFailed on ${backupPath}: ${exifErr.message}`);
                    errorCount++;
                    return;
                }

                processedCount++;
                if (processedCount % 100 === 0) {
                    process.stdout.write(`\rProgress: ${processedCount} processed, ${notFoundCount} not found, ${errorCount} errors`);
                }
            })();

            activePromises.push(promise);

            if (activePromises.length >= concurrencyLimit) {
                await Promise.all(activePromises);
                activePromises = [];
            }
        }

        if (activePromises.length > 0) {
            await Promise.all(activePromises);
        }

        console.log(`\nFinished sync. Processed: ${processedCount}, Not Found in backup: ${notFoundCount}, Errors: ${errorCount}`);

    } catch (e) {
        console.error("Error during execution:", e);
    } finally {
        db.detach();
        await exiftool.end();
    }
}

main().catch(console.error);
