/** driftara CLI argument parsing + output (same commands and exit codes as vexlum). */
import fs from "node:fs";

export interface CliCommand {
    command: "mcp" | "search" | "resolve" | "exec" | "list" | "status" | "help";
    tool?: string;
    args: Record<string, unknown>;
    json: boolean;
}

export const USAGE = `driftara — Driftara Gallery single entry point (search -> resolve -> execute)

Usage:
  driftara [mcp]                                  run the stdio MCP server (default)
  driftara search <query...> [--source S] [--category C] [--tier T] [--limit N] [--schemas]
  driftara resolve <action_id>
  driftara exec <action_id> [--args JSON | --args-file PATH] [--dry-run] [--confirm] [--token T] [--request-id ID]
  driftara list [--source S] [--category C] [--tier T]
  driftara status
Flags: --json prints raw envelopes. Sources: local|ipc|cdp|api|system. Tiers: read|write|destructive.
Exit codes: 0 success, 1 action error, 2 usage error. Backend REST/SQL actions: use vexlum.
`;

export class CliUsageError extends Error {}

function takeValue(argv: string[], i: number, flag: string): string {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) {
        throw new CliUsageError(`${flag} needs a value`);
    }
    return v;
}

function parseArgsJson(raw: string, flag: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new CliUsageError(`${flag} is not valid JSON: ${(err as Error).message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new CliUsageError(`${flag} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
}

export function parseCliArgs(argv: string[], readFile: (p: string) => string = (p) => fs.readFileSync(p, "utf-8")): CliCommand {
    const rest = [...argv];
    let json = false;
    const jsonIdx = rest.indexOf("--json");
    if (jsonIdx >= 0) {
        json = true;
        rest.splice(jsonIdx, 1);
    }
    const head = rest.shift();
    if (head === undefined || head === "mcp") {
        return { command: "mcp", args: {}, json };
    }
    if (head === "help" || head === "--help" || head === "-h") {
        return { command: "help", args: {}, json };
    }

    const positional: string[] = [];
    const flags: Record<string, unknown> = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        switch (a) {
            case "--source":
            case "--category":
            case "--tier":
            case "--token":
            case "--request-id":
                flags[a.slice(2)] = takeValue(rest, i, a);
                i++;
                break;
            case "--limit": {
                const n = Number(takeValue(rest, i, a));
                if (!Number.isFinite(n)) throw new CliUsageError("--limit must be a number");
                flags.limit = n;
                i++;
                break;
            }
            case "--args":
                if ("arguments" in flags) throw new CliUsageError("use --args or --args-file, not both");
                flags.arguments = parseArgsJson(takeValue(rest, i, a), "--args");
                i++;
                break;
            case "--args-file": {
                if ("arguments" in flags) throw new CliUsageError("use --args or --args-file, not both");
                const p = takeValue(rest, i, a);
                i++;
                let raw: string;
                try {
                    raw = readFile(p);
                } catch (err) {
                    throw new CliUsageError(`--args-file ${p}: ${(err as Error).message}`);
                }
                flags.arguments = parseArgsJson(raw.replace(/^﻿/, ""), "--args-file");
                break;
            }
            case "--dry-run":
                flags.dry_run = true;
                break;
            case "--confirm":
                flags.confirmed = true;
                break;
            case "--schemas":
                flags.include_schemas = true;
                break;
            default:
                if (a.startsWith("--")) {
                    throw new CliUsageError(`unknown flag ${a}`);
                }
                positional.push(a);
        }
    }

    if (head === "search") {
        const out: Record<string, unknown> = { query: positional.join(" ") };
        for (const k of ["source", "category", "tier", "limit", "include_schemas"]) {
            if (k in flags) out[k] = flags[k];
        }
        return { command: "search", tool: "search", args: out, json };
    }
    if (head === "resolve") {
        if (!positional[0]) throw new CliUsageError("resolve needs an action_id");
        return { command: "resolve", tool: "resolve", args: { action_id: positional[0] }, json };
    }
    if (head === "exec" || head === "execute") {
        if (!positional[0]) throw new CliUsageError("exec needs an action_id");
        const out: Record<string, unknown> = { action_id: positional[0], arguments: flags.arguments ?? {} };
        if (flags.dry_run) out.dry_run = true;
        if (flags.confirmed) out.confirmed = true;
        if (flags.token) out.confirm_token = flags.token;
        if (flags["request-id"]) out.request_id = flags["request-id"];
        return { command: "exec", tool: "execute", args: out, json };
    }
    if (head === "list") {
        const out: Record<string, unknown> = {};
        for (const k of ["source", "category", "tier"]) {
            if (k in flags) out[k] = flags[k];
        }
        return { command: "list", tool: "list", args: out, json };
    }
    if (head === "status") {
        return { command: "status", tool: "execute", args: { action_id: "system.status" }, json };
    }
    throw new CliUsageError(`unknown command ${head}`);
}

function pad(s: string, n: number): string {
    return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export function formatResult(cmd: CliCommand, result: Record<string, unknown>): string {
    if (cmd.json) {
        return JSON.stringify(result, null, 2);
    }
    if (result.status === "error") {
        const details = result.details ? `\n${JSON.stringify(result.details, null, 2)}` : "";
        return `error [${String(result.code)}]: ${String(result.message)}${details}`;
    }
    if (cmd.command === "search" && Array.isArray(result.results)) {
        const lines = (result.results as Record<string, unknown>[]).map((r) => {
            const req = Array.isArray(r.required_args) && r.required_args.length ? `  [req: ${r.required_args.join(",")}]` : "";
            return `${Number(r.confidence ?? 0).toFixed(2)}  ${pad(String(r.tier), 11)} ${pad(String(r.action_id), 46)} ${String(r.title ?? "")}${req}`;
        });
        if (result.low_confidence) lines.push("(low confidence: refine the query or filter with --source/--category)");
        return lines.join("\n");
    }
    if (cmd.command === "list" && Array.isArray(result.actions)) {
        const rows = result.actions as Record<string, unknown>[];
        return [
            ...rows.map((r) => `${pad(String(r.tier), 11)} ${pad(String(r.action_id), 46)} ${String(r.title ?? "")}`),
            `${rows.length} actions`,
        ].join("\n");
    }
    return JSON.stringify(result, null, 2);
}
