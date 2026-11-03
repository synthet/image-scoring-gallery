/**
 * Argument validation for the JSON Schema subset the catalog generator emits:
 * type, enum, properties, required, additionalProperties, items, anyOf.
 */
import { ValidationError } from "./errors.js";

type Schema = Record<string, unknown>;

function typeOf(v: unknown): string {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
    return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
    const actual = typeOf(v);
    if (t === "number") return actual === "number" || actual === "integer";
    return actual === t;
}

/** Returns the first problem as { path, message }, or null when the value conforms. */
export function firstViolation(value: unknown, schema: Schema, at = "$"): { path: string; message: string } | null {
    if (Array.isArray(schema.anyOf)) {
        const ok = (schema.anyOf as Schema[]).some((s) => firstViolation(value, s, at) === null);
        return ok ? null : { path: at, message: "does not match any allowed shape" };
    }
    if (typeof schema.type === "string" && !matchesType(value, schema.type)) {
        return { path: at, message: `expected ${schema.type}, got ${typeOf(value)}` };
    }
    if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) {
        return { path: at, message: `must be one of ${JSON.stringify(schema.enum)}` };
    }
    if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
        for (let i = 0; i < value.length; i++) {
            const v = firstViolation(value[i], schema.items as Schema, `${at}[${i}]`);
            if (v) return v;
        }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const props = (schema.properties ?? {}) as Record<string, Schema>;
        for (const key of (schema.required as string[] | undefined) ?? []) {
            if (!(key in obj)) return { path: `${at}.${key}`, message: "is required" };
        }
        for (const [key, v] of Object.entries(obj)) {
            if (props[key]) {
                const sub = firstViolation(v, props[key], `${at}.${key}`);
                if (sub) return sub;
            }
        }
    }
    return null;
}

/** Validate execute() arguments against a record's input_schema (does not fill defaults). */
export function validateArguments(args: Record<string, unknown>, schema: Schema): Record<string, unknown> {
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    if (schema.additionalProperties === false) {
        const extra = Object.keys(args).filter((k) => !(k in props));
        if (extra.length) {
            throw new ValidationError(`unexpected argument(s): ${extra.join(", ")}`, {
                extra_keys: extra,
                allowed: Object.keys(props),
            });
        }
    }
    const missing = ((schema.required as string[] | undefined) ?? []).filter((k) => !(k in args));
    if (missing.length) {
        throw new ValidationError(`missing required argument(s): ${missing.join(", ")}`, { missing });
    }
    const v = firstViolation(args, schema);
    if (v) throw new ValidationError(`${v.path} ${v.message}`, { path: v.path });
    return args;
}
