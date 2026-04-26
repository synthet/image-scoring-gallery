/** Minimal JPEG builders for unit tests (no scan data — EXIF parse only). */

export function createJpegWithApp1(segments: { type: string; data: number[] }[]): Blob {
    const parts: number[] = [0xff, 0xd8]; // SOI

    for (const seg of segments) {
        if (seg.type === 'EXIF') {
            const length = 6 + 2 + 2 + 2 + 4 + 2 + seg.data.length * 12 + 4;
            parts.push(0xff, 0xe1); // APP1
            parts.push((length >> 8) & 0xff, length & 0xff); // Length
            parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00); // "Exif\0\0"

            parts.push(0x49, 0x49, 0x2a, 0x00); // "II", 42
            parts.push(0x08, 0x00, 0x00, 0x00); // Offset to first IFD (8)

            parts.push(seg.data.length & 0xff, (seg.data.length >> 8) & 0xff); // Num entries
            for (const orientation of seg.data) {
                parts.push(0x12, 0x01); // Tag: Orientation (0x0112)
                parts.push(0x03, 0x00); // Type: SHORT (3)
                parts.push(0x01, 0x00, 0x00, 0x00); // Count: 1
                parts.push(orientation & 0xff, (orientation >> 8) & 0xff); // Value
                parts.push(0x00, 0x00); // Padding
            }
            parts.push(0x00, 0x00, 0x00, 0x00); // Next IFD offset
        } else if (seg.type === 'XMP') {
            const length = 2 + seg.data.length;
            parts.push(0xff, 0xe1); // APP1
            parts.push((length >> 8) & 0xff, length & 0xff); // Length
            for (const b of seg.data) parts.push(b);
        }
    }

    parts.push(0xff, 0xd9); // EOI
    return new Blob([new Uint8Array(parts)], { type: 'image/jpeg' });
}
