const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { loadMergedConfig } = require('./load-config.cjs');
const { ExifTool } = require('exiftool-vendored');

const exiftool = new ExifTool({ maxProcs: 10 });

async function main() {
    const projectRoot = path.resolve(__dirname, '..');
    const config = loadMergedConfig(projectRoot);
    const dbCfg = config.database?.postgres || {};

    const pool = new Pool({
        host: dbCfg.host || 'localhost',
        port: dbCfg.port || 5432,
        user: dbCfg.user || 'postgres',
        password: dbCfg.password || 'postgres',
        database: dbCfg.database || 'image_scoring',
        max: 20, // Allow up to 20 concurrent connections
    });

    console.log(`Connecting to PostgreSQL Pool at ${dbCfg.host}:${dbCfg.port}...`);
    
    try {
        // Find images missing EXIF dates
        const query = `
            SELECT i.id, i.file_path, i.file_name
            FROM images i
            JOIN image_exif ex ON i.id = ex.image_id
            WHERE ex.date_time_original IS NULL AND ex.create_date IS NULL
            ORDER BY i.id ASC
        `;
        const res = await pool.query(query);
        const images = res.rows;
        console.log(`Found ${images.length} images missing EXIF dates in DB.`);

        if (images.length === 0) {
            console.log("Nothing to repair.");
            return;
        }

        const batchSize = 100;
        let processed = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        const startTime = Date.now();

        for (let i = 0; i < images.length; i += batchSize) {
            const batch = images.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(images.length / batchSize);
            
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = processed / elapsed;
            const eta = rate > 0 ? Math.round((images.length - processed) / rate) : 0;

            process.stdout.write(`Batch ${batchNum}/${totalBatches} [${processed}/${images.length}] Rate: ${rate.toFixed(1)}/s ETA: ${eta}s    \r`);

            await Promise.all(batch.map(async (img) => {
                let filePath = img.file_path;
                if (process.platform === 'win32' && filePath.startsWith('/mnt/')) {
                    filePath = filePath.replace(/^\/?mnt\/([a-zA-Z])\//, (match, drive) => `${drive.toUpperCase()}:/`);
                }

                if (!fs.existsSync(filePath)) {
                    skipped++;
                    processed++;
                    return;
                }

                try {
                    const tags = await exiftool.read(filePath);
                    const dto = tags.DateTimeOriginal ? tags.DateTimeOriginal.toString() : null;
                    const cd = tags.CreateDate ? tags.CreateDate.toString() : null;

                    if (dto || cd) {
                        await pool.query(
                            'UPDATE image_exif SET date_time_original = $1, create_date = $2 WHERE image_id = $3',
                            [dto, cd, img.id]
                        );
                        updated++;
                    } else {
                        skipped++;
                    }
                } catch (err) {
                    // console.error(`\nError reading ${filePath}:`, err.message);
                    errors++;
                }
                processed++;
            }));
        }

        const totalTime = (Date.now() - startTime) / 1000;
        console.log(`\n\nRepair complete in ${totalTime.toFixed(1)}s!`);
        console.log(`- Total reviewed: ${processed}`);
        console.log(`- Updated in DB:  ${updated}`);
        console.log(`- Skipped/No tag: ${skipped}`);
        console.log(`- Errors:         ${errors}`);
        console.log(`- Average rate:   ${(processed / totalTime).toFixed(1)} images/s`);
        
    } catch (err) {
        console.error("\nFatal error during processing:", err);
    } finally {
        await pool.end();
        await exiftool.end();
    }
}

main().catch(err => {
    console.error("Unhandled promise rejection:", err);
    process.exit(1);
});
