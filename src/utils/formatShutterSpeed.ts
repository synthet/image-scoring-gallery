/**
 * Human-readable shutter speed for the EXIF sidebar (fractions for sub-second, not raw decimals).
 */
export function formatShutterSpeedDisplay(raw: string | number | undefined | null): string {
    if (raw === undefined || raw === null) return 'Unknown';
    let s = typeof raw === 'number' ? String(raw) : String(raw).trim();
    if (!s) return 'Unknown';

    s = s.replace(/\s*s$/i, '').trim();
    s = s.replace(/\s*(?:sec|seconds?)\s*$/i, '').trim();
    if (!s) return 'Unknown';

    const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (frac) {
        const num = parseInt(frac[1], 10);
        const den = parseInt(frac[2], 10);
        if (den !== 0 && num >= 0) return `${num}/${den}s`;
    }

    const normalized = s.replace(',', '.');
    const n = parseFloat(normalized);
    if (!Number.isFinite(n) || n <= 0) return 'Unknown';

    if (n < 1) {
        const denom = Math.max(1, Math.round(1 / n));
        return `1/${denom}s`;
    }

    if (Number.isInteger(n)) return `${n}s`;
    const rounded = Math.round(n * 1000) / 1000;
    return `${rounded}s`;
}
