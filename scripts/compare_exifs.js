const { ExifTool } = require('exiftool-vendored');
const exiftool = new ExifTool();

async function dump() {
    const f1 = 'D:/Photos/Z8/105mm/2025/2025-12-17/DSC_6667.NEF';
    const t1 = await exiftool.read(f1);
    console.log(JSON.stringify(t1, null, 2));
    await exiftool.end();
}

dump().catch(console.error);
