const Firebird = require('node-firebird');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadMergedConfig } = require('./load-config.cjs');
const { ExifTool } = require('exiftool-vendored');
const exiftool = new ExifTool({ maxProcs: 10 });

async function main() {
    console.log("Starting UUID generation (Deterministic Mode - Read Only)...");

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

    console.log(`Connecting to DB at: ${dbPath}`);

    const db = await new Promise((resolve, reject) => {
        Firebird.attach(options, (err, db) => {
            if (err) reject(err);
            else resolve(db);
        });
    });

    console.log("Connected to Firebird.");

    try {
        // Query to find images without IMAGE_UUID
        const images = await new Promise((resolve, reject) => {
            db.query('SELECT id, file_path, file_name FROM images WHERE image_uuid IS NULL', [], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        console.log(`Found ${images.length} images to process. Using exiftool-vendored pool.`);

        // Process in larger batches since we're only reading
        const concurrencyLimit = 50;
        let activePromises = [];
        let processedCount = 0;
        let errorCount = 0;

        for (let i = 0; i < images.length; i++) {
            const img = images[i];

            const promise = (async () => {
                let filePath = img.file_path || img.FILE_PATH;

                if (!filePath) {
                    return;
                }

                // Convert WSL paths like /mnt/d/... to D:/... if running on Windows
                if (process.platform === 'win32' && filePath.match(/^\/?mnt\/[a-zA-Z]\//)) {
                    filePath = filePath.replace(/^\/?mnt\/([a-zA-Z])\//, (match, drive) => `${drive.toUpperCase()}:/`);
                }

                let uuid;

                if (fs.existsSync(filePath)) {
                    try {
                        const tags = await exiftool.read(filePath);

                        // Create a deterministic string from metadata
                        // Prefer absolute unique things like ShutterCount, combined with time, model, and original filename.
                        // Add file size to deal with potential collisions (e.g. rapid fire shots with same second timestamp and no sub-second)
                        // Removed file size and file modification time to ensure UUIDs are stable even if metadata is edited later.

                        const uniqueString = [
                            tags.CreateDate || tags.DateTimeOriginal || '',
                            tags.SubSecTimeOriginal || tags.SubSecTimeDigitized || tags.SubSecTime || '',
                            tags.Model || 'UnknownCamera',
                            tags.LensModel || 'UnknownLens',
                            tags.ShutterCount || '0'
                        ].join('|');

                        // Hash to create a standardized UUID v5-like shape
                        const hash = crypto.createHash('sha256').update(uniqueString).digest('hex');
                        // Format as UUID: 8-4-4-4-12
                        uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

                    } catch (exifErr) {
                        console.error(`\nFailed to execute exiftool on ${filePath}: ${exifErr.message}`);
                        errorCount++;
                        return; // Skip DB update if file metadata read fails
                    }
                } else {
                    console.error(`\nFile not found: ${filePath}`);
                    errorCount++;
                    return;
                }

                // Update the DB
                await new Promise((resolve, reject) => {
                    db.query('UPDATE images SET image_uuid = ? WHERE id = ?', [uuid, img.id || img.ID], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                processedCount++;
                if (processedCount % 100 === 0 || processedCount === images.length) {
                    process.stdout.write(`\rProgress: ${processedCount}/${images.length} (Errors: ${errorCount})`);
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

        console.log(`\nFinished processing all images. Total: ${images.length}, Success: ${processedCount}, Errors: ${errorCount}`);

    } catch (e) {
        console.error("\nError during execution:", e);
    } finally {
        db.detach();
        await exiftool.end();
        console.log("Cleanup complete.");
    }
}

main().catch(console.error);
