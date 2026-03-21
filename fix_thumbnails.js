const { exiftool } = require('exiftool-vendored');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const Firebird = require('node-firebird');

// DB config
const options = {};
options.host = '127.0.0.1';
options.port = 3050;
const siblingDb = ['image-scoring-backend', 'image-scoring'].map((d) =>
    path.join(__dirname, '..', d, 'SCORING_HISTORY.FDB')
).find((p) => fs.existsSync(p));
options.database = process.env.DB_PATH || siblingDb || path.join(__dirname, '..', 'image-scoring-backend', 'SCORING_HISTORY.FDB');
options.user = 'sysdba';
options.password = 'masterkey';
options.lowercase_keys = true;

const IS_WIN = process.platform === 'win32';

function convertPathToLocal(p) {
    if (IS_WIN && p) {
        const pStr = p.replace(/\\/g, '/');
        if (pStr.startsWith('/mnt/')) {
            const parts = pStr.split('/');
            if (parts.length > 2 && parts[2].length === 1) {
                const drive = parts[2].toUpperCase();
                const rest = parts.slice(3).join('/');
                return `${drive}:/${rest}`;
            }
        }
    }
    return p;
}

async function ensureOrientationColumn(db) {
    console.log('Checking if ORIENTATION column exists in IMAGES table...');
    return new Promise((resolve, reject) => {
        db.query(`SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'IMAGES' AND RDB$FIELD_NAME = 'ORIENTATION'`, (err, result) => {
            if (err) return reject(err);
            if (result && result.length === 0) {
                console.log('Adding ORIENTATION column to IMAGES...');
                db.query(`ALTER TABLE IMAGES ADD ORIENTATION VARCHAR(50)`, (err2) => {
                    if (err2) reject(err2);
                    else {
                        console.log('Successfully added ORIENTATION column.');
                        resolve();
                    }
                });
            } else {
                console.log('ORIENTATION column already exists.');
                resolve();
            }
        });
    });
}

function updateImageOrientation(db, id, orientationStr) {
    return new Promise((resolve, reject) => {
        db.query(`UPDATE IMAGES SET ORIENTATION = ? WHERE ID = ?`, [orientationStr, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function rotateThumbnail(thumbnailPath) {
    if (!thumbnailPath) return;
    const localThumbPath = convertPathToLocal(thumbnailPath);
    if (!fs.existsSync(localThumbPath)) return;

    try {
        const tempPath = localThumbPath + '.tmp.jpg';

        // Use sharp with .withMetadata() to auto-rotate based on the EXIF Orientation
        // Since the thumbnail doesn't have EXIF, wait, if the thumbnail has no EXIF, 
        // withMetadata() won't rotate it.
        // We need to EXPLICITLY rotate it if we want to change pixel data, or just use exiftool to add the EXIF tag.

        // Actually, the safest and non-destructive way is just to add the EXIF Orientation tag to the thumbnail via Exiftool.
        // That way `image-orientation: from-image` works for thumbnails too.
        // If we want sharp to rotate pixels: sharp(localThumbPath).rotate().toFile() -> only works if there's EXIF.

        // Let's just use exiftool which does it perfectly without re-encoding.
        return false;
    } catch (e) {
        throw e;
    }
}

async function main() {
    console.log('Connecting to database...');

    const db = await new Promise((resolve, reject) => {
        Firebird.attach(options, (err, db) => {
            if (err) reject(err);
            else resolve(db);
        });
    });

    try {
        await ensureOrientationColumn(db);

        console.log('Fetching images...');

        // Get images that haven't been processed yet (where ORIENTATION is null) or just all of them.
        // Let's do all images where ORIENTATION IS NULL.
        const images = await new Promise((resolve, reject) => {
            db.query(`SELECT ID, FILE_NAME, FILE_PATH, THUMBNAIL_PATH FROM IMAGES WHERE ORIENTATION IS NULL`, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        console.log(`Found ${images.length} images to process.`);

        let processed = 0;
        let errors = 0;
        let rotatedThumbs = 0;

        for (const img of images) {
            try {
                const localPath = convertPathToLocal(img.file_path);
                if (!fs.existsSync(localPath)) {
                    await updateImageOrientation(db, img.id, 'missing_file');
                    processed++;
                    continue;
                }

                const tags = await exiftool.read(localPath);
                let orientation = tags.Orientation;
                const orientationStr = orientation ? String(orientation) : 'Unknown';

                // Update DB
                await updateImageOrientation(db, img.id, orientationStr);

                // Fix thumbnail if it's explicitly rotated
                const isRotated = orientation && orientationStr !== '1' && orientationStr !== 'Horizontal (normal)' && orientationStr !== 'Unknown';

                if (isRotated && img.thumbnail_path) {
                    const localThumbPath = convertPathToLocal(img.thumbnail_path);
                    if (fs.existsSync(localThumbPath)) {
                        // Apply orientation to thumbnail using exiftool
                        await exiftool.write(localThumbPath, { Orientation: orientation }, ['-overwrite_original']);
                        rotatedThumbs++;
                        console.log(`Rotated thumbnail for ${img.file_name} (ID: ${img.id}, Orientation: ${orientationStr})`);
                    }
                }

                processed++;
                if (processed % 100 === 0) {
                    console.log(`Progress: ${processed} / ${images.length}`);
                }

            } catch (err) {
                errors++;
                console.error(`Error processing image ${img.id}: ${err.message}`);
                // Save error state so it's not retried endlessly
                await updateImageOrientation(db, img.id, 'error').catch(() => { });
            }
        }

        console.log('\n--- Done ---');
        console.log(`Processed: ${processed}`);
        console.log(`Rotated Thumbnails: ${rotatedThumbs}`);
        console.log(`Errors: ${errors}`);

    } finally {
        db.detach();
        await exiftool.end();
    }
}

main().catch(console.error);
