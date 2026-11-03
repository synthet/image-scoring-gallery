import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CliUsageError, formatResult, parseCliArgs } from "./cli.js";

describe("driftara CLI parser", () => {
    it("defaults to the MCP server", () => {
        assert.equal(parseCliArgs([]).command, "mcp");
        assert.equal(parseCliArgs(["mcp"]).command, "mcp");
        assert.equal(parseCliArgs(["--help"]).command, "help");
    });

    it("parses search filters and --json anywhere", () => {
        const c = parseCliArgs(["search", "delete", "image", "--source", "ipc", "--tier", "destructive", "--limit", "3", "--schemas", "--json"]);
        assert.equal(c.json, true);
        assert.deepEqual(c.args, { query: "delete image", source: "ipc", tier: "destructive", limit: 3, include_schemas: true });
    });

    it("parses exec with args, dry run, confirm, token and request id", () => {
        const c = parseCliArgs(["exec", "ipc.db.delete-image", "--args", '{"id":7}', "--dry-run", "--confirm", "--token", "1.ab", "--request-id", "r1"]);
        assert.equal(c.tool, "execute");
        assert.deepEqual(c.args, { action_id: "ipc.db.delete-image", arguments: { id: 7 }, dry_run: true, confirmed: true, confirm_token: "1.ab", request_id: "r1" });
        assert.equal(parseCliArgs(["execute", "ipc.ping"]).command, "exec");
    });

    it("reads --args-file (BOM tolerated)", () => {
        const c = parseCliArgs(["exec", "x", "--args-file", "a.json"], () => '\uFEFF{"targetPath":"E:/"}');
        assert.deepEqual(c.args.arguments, { targetPath: "E:/" });
        assert.throws(() => parseCliArgs(["exec", "x", "--args-file", "missing.json"], () => {
            throw new Error("ENOENT");
        }), CliUsageError);
        assert.throws(() => parseCliArgs(["exec", "x", "--args", "{}", "--args-file", "a.json"], () => "{}"), CliUsageError);
    });

    it("maps status and list", () => {
        assert.deepEqual(parseCliArgs(["status"]).args, { action_id: "system.status" });
        assert.deepEqual(parseCliArgs(["list", "--source", "cdp"]).args, { source: "cdp" });
    });

    it("rejects bad input with usage errors (exit 2)", () => {
        for (const argv of [["bogus"], ["exec"], ["resolve"], ["exec", "x", "--args", "[1]"], ["exec", "x", "--args", "{bad"], ["search", "--source"], ["search", "--nope"], ["search", "--limit", "abc"]]) {
            assert.throws(() => parseCliArgs(argv), CliUsageError, argv.join(" "));
        }
    });

    it("formats errors and search rows", () => {
        const search = parseCliArgs(["search", "x"]);
        assert.match(formatResult(search, { status: "error", code: "unknown_action", message: "nope" }), /^error \[unknown_action\]: nope/);
        const out = formatResult(search, { results: [{ confidence: 1, tier: "read", action_id: "ipc.ping", title: "Ping", required_args: ["a"] }], low_confidence: true });
        assert.match(out, /^1\.00 {2}read +ipc\.ping +Ping {2}\[req: a\]/);
        assert.match(out, /low confidence/);
    });
});
