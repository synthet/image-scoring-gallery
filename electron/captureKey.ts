/**
 * Capture key: identifies a frame by what the camera recorded, wherever the file lives.
 *
 * Format: `<Model>|<ShutterCount>|<YYYY-MM-DDTHH:MM:SS>`. Sub-seconds and time zone
 * offsets are dropped. The value is `null` unless all three fields are usable.
 *
 * A card original has no ImageUniqueID, so this key is how Sync recognises a deleted
 * frame at a new path.
 *
 * **Keep in sync with** `image-scoring-pipeline/modules/capture_key.py`. Both repos test
 * against the same `tests/fixtures/capture_key_vectors.json`.
 */

const DATE_PATTERN = /^\s*(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

function pad(value: number, width = 2): string {
    return String(value).padStart(width, '0');
}

function rawDate(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object' && 'rawValue' in value && typeof value.rawValue === 'string') {
        return value.rawValue;
    }
    return String(value);
}

function toSecond(value: unknown): string | null {
    const match = rawDate(value)?.match(DATE_PATTERN);
    if (!match) return null;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    // Rejects 0000:00:00 00:00:00 and dates that roll over, such as 31 February.
    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day ||
        parsed.getUTCHours() !== hour ||
        parsed.getUTCMinutes() !== minute ||
        parsed.getUTCSeconds() !== second
    ) {
        return null;
    }
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function toShutter(value: unknown): number | null {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return null;
    const count = Number(text);
    return count > 0 ? count : null;
}

/** Returns the capture key, or `null` when a field is missing or unusable. */
export function captureKey(model: unknown, shutterCount: unknown, dateTimeOriginal: unknown): string | null {
    const name = typeof model === 'string' ? model.trim() : '';
    const count = toShutter(shutterCount);
    const second = toSecond(dateTimeOriginal);
    if (!name || count === null || second === null) return null;
    return `${name}|${count}|${second}`;
}
