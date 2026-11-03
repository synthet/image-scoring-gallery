/** Mask secret-looking values before an envelope leaves driftara (config payloads carry DB passwords and API keys). */

const SECRET_KEY = /(password|passwd|secret|token|api[_-]?key|apikey|credential|private[_-]?key)/i;
/** "key": "value" pairs inside text payloads (e.g. a config dump returned as text). */
const SECRET_PAIR = /("[^"]*(?:password|passwd|secret|token|api[_-]?key|apikey|credential|private[_-]?key)[^"]*"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;

export const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
    if (depth > 12) return value;
    if (typeof value === "string") return value.replace(SECRET_PAIR, `$1"${REDACTED}"`);
    if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [
                k,
                SECRET_KEY.test(k) && (typeof v === "string" || typeof v === "number") && v !== "" ? REDACTED : redact(v, depth + 1),
            ]),
        );
    }
    return value;
}
