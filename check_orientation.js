const { exiftool } = require('exiftool-vendored');
const path = require('path');
const fs = require('fs');
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

async function main() {
    console.log('Connecting to database...');

    // Connect to database
    const db = await new Promise((resolve, reject) => {
        Firebird.attach(options, (err, db) => {
            if (err) reject(err);
            else resolve(db);
        });
    });

    console.log('Fetching a sample of images (some NEF, some JPG)...');

    // Get a sample of images
    const images = await new Promise((resolve, reject) => {
        db.query(`SELECT FIRST 200 ID, FILE_NAME, FILE_PATH FROM IMAGES ORDER BY RAND()`, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    console.log(`Found ${images.length} images. Processing...`);

    const orientationStats = {
        total: 0,
        horizontal: 0,
        rotated: 0,
        missing: 0,
        errors: 0,
        types: {}
    };

    const processingResults = [];

    for (const img of images) {
        try {
            const localPath = convertPathToLocal(img.file_path);
            const ext = path.extname(localPath).toLowerCase();

            // Only process NEF and JPG for now
            if (!['.nef', '.jpg', '.jpeg'].includes(ext)) continue;

            orientationStats.total++;

            // Read EXIF data
            const t0 = performance.now();
            const tags = await exiftool.read(localPath);
            const t1 = performance.now();

            const orientation = tags.Orientation;
            const orientationStr = String(orientation);

            let category = 'missing';
            if (orientation) {
                if (orientationStr === '1' || orientationStr === 'Horizontal (normal)') {
                    category = 'horizontal';
                    orientationStats.horizontal++;
                } else {
                    category = 'rotated';
                    orientationStats.rotated++;
                }

                // Track unique orientation values
                orientationStats.types[orientationStr] = (orientationStats.types[orientationStr] || 0) + 1;
            } else {
                orientationStats.missing++;
            }

            processingResults.push({
                id: img.id,
                name: img.file_name,
                ext,
                orientation: orientationStr || 'none',
                category,
                timeMs: Math.round(t1 - t0)
            });

        } catch (err) {
            orientationStats.errors++;
            console.error(`Error processing image ${img.id}: ${err.message}`);
        }
    }

    db.detach();
    await exiftool.end();

    console.log('\n--- Results ---');
    console.log(`Successfully checked ${processingResults.length} images`);
    console.log(`Horizontal: ${orientationStats.horizontal}`);
    console.log(`Rotated: ${orientationStats.rotated}`);
    console.log(`Missing EXIF Orientation: ${orientationStats.missing}`);
    console.log(`Errors: ${orientationStats.errors}`);

    console.log('\n--- Orientation Values Found ---');
    for (const [val, count] of Object.entries(orientationStats.types)) {
        console.log(`"${val}": ${count} images`);
    }

    console.log('\n--- Sample of Rotated Images ---');
    const rotated = processingResults.filter(r => r.category === 'rotated').slice(0, 5);
    console.table(rotated);

    console.log('\n--- Performance Stats ---');
    const avgTime = processingResults.reduce((sum, r) => sum + r.timeMs, 0) / (processingResults.length || 1);
    console.log(`Average EXIF read time: ${avgTime.toFixed(1)} ms per image`);

    // Recommendations
    console.log('\n--- Conclusion ---');
    if (avgTime > 100) {
        console.log('EXIF reading is slow. Caching orientation in the database is HIGHLY RECOMMENDED.');
    } else if (orientationStats.rotated > 0) {
        console.log('Found rotated images. Caching orientation in the DB would avoid EXIF reads on every render, but reads are relatively fast.');
    } else {
        console.log('No rotated images found in sample, but caching might still be useful for full library.');
    }
}

main().catch(console.error);
