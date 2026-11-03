/**
 * Tiered execute policy: read / write / destructive (port of vexlum's modules/vexlum/policy.py).
 *
 * - read        runs immediately.
 * - write       needs confirmed=true (dry_run=true previews without it).
 * - destructive needs env DRIFTARA_ALLOW_ELEVATED=1 on the process that runs the action, a prior
 *               dry_run=true that returned a confirm_token for the *same* arguments, then
 *               confirmed=true with that token.
 *
 * Tokens are `<expiry>.<hmac>` over (action_id, canonical args, expiry). The key comes from
 * DRIFTARA_TOKEN_SECRET or a per-user key file (~/.driftara/confirm.key, override with
 * DRIFTARA_TOKEN_KEY_FILE), so a CLI dry run in one process can be confirmed by the next one.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ConfirmationRequiredError, ConfirmTokenError, PolicyError } from "./errors.js";

export const TIERS = ["read", "write", "destructive"] as const;
export type Tier = (typeof TIERS)[number];
export const TOKEN_TTL_SECONDS = 600;
export const ELEVATED_ENV = "DRIFTARA_ALLOW_ELEVATED";

let keyCache: Buffer | null = null;

function keyPath(): string {
    const override = (process.env.DRIFTARA_TOKEN_KEY_FILE ?? "").trim();
    return override ? override : path.join(os.homedir(), ".driftara", "confirm.key");
}

function tokenKey(): Buffer {
    const env = (process.env.DRIFTARA_TOKEN_SECRET ?? "").trim();
    if (env) return Buffer.from(env, "utf-8");
    if (keyCache) return keyCache;
    const p = keyPath();
    try {
        if (fs.existsSync(p)) {
            keyCache = Buffer.from(fs.readFileSync(p, "utf-8").trim(), "utf-8");
        } else {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            const key = crypto.randomBytes(32).toString("hex");
            fs.writeFileSync(p, key, { encoding: "ascii", flag: "wx", mode: 0o600 });
            keyCache = Buffer.from(key, "ascii");
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") {
            keyCache = Buffer.from(fs.readFileSync(p, "utf-8").trim(), "utf-8");
        } else {
            // Read-only home: fall back to a per-process key (tokens then only live in one process).
            keyCache = Buffer.from(crypto.randomBytes(32).toString("hex"), "ascii");
        }
    }
    return keyCache;
}

/** Tests only. */
export function resetTokenKeyCache(): void {
    keyCache = null;
}

/** Python `json.dumps(value, sort_keys=True)` formatting: sorted keys, ", " / ": " separators, ASCII escapes. */
export function canonicalJson(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "string") {
        return JSON.stringify(value).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    }
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(", ")}]`;
    if (typeof value === "object") {
        const entries = Object.keys(value as Record<string, unknown>)
            .sort()
            .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
            .map((k) => `${canonicalJson(k)}: ${canonicalJson((value as Record<string, unknown>)[k])}`);
        return `{${entries.join(", ")}}`;
    }
    return canonicalJson(String(value));
}

function canonical(actionId: string, args: Record<string, unknown>, expiry: number): string {
    return canonicalJson({ a: actionId, args, exp: expiry });
}

function sign(actionId: string, args: Record<string, unknown>, expiry: number): string {
    return crypto.createHmac("sha256", tokenKey()).update(canonical(actionId, args, expiry), "utf-8").digest("hex").slice(0, 40);
}

function nowSeconds(now?: number): number {
    return now !== undefined ? now : Date.now() / 1000;
}

export function issueToken(
    actionId: string,
    args: Record<string, unknown>,
    now?: number,
): { confirm_token: string; expires_at: number; ttl_seconds: number } {
    const expiry = Math.trunc(nowSeconds(now) + TOKEN_TTL_SECONDS);
    return { confirm_token: `${expiry}.${sign(actionId, args, expiry)}`, expires_at: expiry, ttl_seconds: TOKEN_TTL_SECONDS };
}

export function verifyToken(actionId: string, args: Record<string, unknown>, token: string | undefined | null, now?: number): void {
    if (!token || !token.includes(".")) {
        throw new ConfirmTokenError("destructive action needs confirm_token from a dry_run with the same arguments", {
            next: "execute(..., dry_run=true) then execute(..., confirmed=true, confirm_token=...)",
        });
    }
    const dot = token.indexOf(".");
    const expRaw = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!/^-?\d+$/.test(expRaw.trim())) {
        throw new ConfirmTokenError("malformed confirm_token");
    }
    const expiry = parseInt(expRaw, 10);
    if (nowSeconds(now) > expiry) {
        throw new ConfirmTokenError("confirm_token expired; run dry_run again", { expired_at: expiry });
    }
    const expected = Buffer.from(sign(actionId, args, expiry), "utf-8");
    const given = Buffer.from(sig, "utf-8");
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
        throw new ConfirmTokenError("confirm_token does not match this action and arguments (arguments changed?)", {
            next: "run dry_run again with the final arguments",
        });
    }
}

export function elevatedAllowed(): boolean {
    return ["1", "true", "yes", "on"].includes((process.env[ELEVATED_ENV] ?? "").trim().toLowerCase());
}

/** What `resolve` advertises for a tier. */
export function requirements(tier: string): { confirmed: boolean; confirm_token: boolean; env: string | null } {
    if (tier === "read") return { confirmed: false, confirm_token: false, env: null };
    if (tier === "write") return { confirmed: true, confirm_token: false, env: null };
    return { confirmed: true, confirm_token: true, env: `${ELEVATED_ENV}=1` };
}

/** Throw when the call may not run. Dry runs are always allowed (they never mutate). */
export function check(
    record: { action_id: string; tier?: string },
    validatedArgs: Record<string, unknown>,
    opts: { dryRun: boolean; confirmed: boolean; confirmToken?: string | null },
): void {
    const tier = String(record.tier || "write");
    if (!(TIERS as readonly string[]).includes(tier)) {
        throw new PolicyError(`unknown tier '${tier}'`, { action_id: record.action_id });
    }
    if (tier === "read" || opts.dryRun) return;
    if (!opts.confirmed) {
        throw new ConfirmationRequiredError(
            `${record.action_id} is tier=${tier}; pass confirmed=true` +
                (tier === "destructive" ? " with the confirm_token from a dry_run" : ""),
            { tier, requires: requirements(tier) },
        );
    }
    if (tier === "destructive") {
        if (!elevatedAllowed()) {
            throw new PolicyError(`${record.action_id} is destructive; set ${ELEVATED_ENV}=1 on the driftara process that runs it`, {
                tier,
                requires: requirements(tier),
                policy: "elevated_env",
            });
        }
        verifyToken(record.action_id, validatedArgs, opts.confirmToken);
    }
}
