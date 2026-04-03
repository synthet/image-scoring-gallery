const Firebird = require('node-firebird');
const fs = require('fs');
const path = require('path');
const { loadMergedConfig } = require('./load-config.cjs');

async function main() {
    console.log("Starting identical duplicate removal script...");

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
        // Find all UUIDs that appear more than once
        const dupQuery = `
            SELECT image_uuid, COUNT(*) as cnt
            FROM images
            WHERE image_uuid IS NOT NULL
            GROUP BY image_uuid
            HAVING COUNT(*) > 1
        `;

        const duplicates = await new Promise((resolve, reject) => {
            db.query(dupQuery, [], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        console.log(`Found ${duplicates.length} UUIDs with multiple file copies.`);

        let filesDeleted = 0;
        let dbRowsDeleted = 0;

        for (const dup of duplicates) {
            const uuid = dup.image_uuid || dup.IMAGE_UUID;

            // Get all records for this UUID
            const rows = await new Promise((resolve, reject) => {
                db.query('SELECT id, file_path FROM images WHERE image_uuid = ? ORDER BY id ASC', [uuid], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            // Keep the first (oldest by ID), delete the rest
            const keep = rows[0];
            const toDelete = rows.slice(1);

            console.log(`\nUUID: ${uuid}`);
            console.log(`  [KEEP] ${keep.file_path || keep.FILE_PATH} (ID: ${keep.id || keep.ID})`);

            for (const row of toDelete) {
                const id = row.id || row.ID;
                const origPath = row.file_path || row.FILE_PATH;

                // Delete from DB first
                await new Promise((resolve, reject) => {
                    db.query('DELETE FROM images WHERE id = ?', [id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                dbRowsDeleted++;

                // Build correct local path for filesystem operations
                let localPath = origPath;
                if (process.platform === 'win32' && localPath.match(/^\/?mnt\/[a-zA-Z]\//)) {
                    localPath = localPath.replace(/^\/?mnt\/([a-zA-Z])\//, (match, drive) => `${drive.toUpperCase()}:/`);
                }

                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                    console.log(`  [DELETE] ${origPath} => Removed DB record and Disk file.`);
                    filesDeleted++;
                } else {
                    console.log(`  [DELETE] ${origPath} => Removed DB record (File was already missing from disk)`);
                }
            }
        }

        console.log(`\nCleanup complete! Deleted ${dbRowsDeleted} database records and ${filesDeleted} files from disk.`);

    } catch (e) {
        console.error("Error occurred:", e);
    } finally {
        db.detach();
    }
}

main().catch(console.error);
