import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dispatchAction } from "./actions/dispatch.js";
import { searchActions } from "./actions/search.js";

describe("gallery MCP dispatch", () => {
    it("search finds gallery_status for gallery status query", () => {
        const result = searchActions("gallery status", { limit: 5 });
        const ids = (result.results as Array<{ action_id: string }>).map((r) => r.action_id);
        assert.ok(ids.includes("local.gallery_status"), `expected local.gallery_status in ${ids.join(", ")}`);
    });

    it("dispatch local.gallery_status dry run validates", async () => {
        const result = await dispatchAction("local.gallery_status", {}, { dryRun: true });
        assert.equal(result.status, "success");
        assert.equal(result.action_id, "local.gallery_status");
        assert.equal(result.dry_run, true);
    });

    it("dispatch unknown action returns error envelope", async () => {
        const result = await dispatchAction("local.no_such_action", {});
        assert.equal(result.status, "error");
        assert.equal(result.code, "unknown_action");
    });

    it("search finds live.cdp_click for click query", () => {
        const result = searchActions("click selector", { limit: 10 });
        const ids = (result.results as Array<{ action_id: string }>).map((r) => r.action_id);
        assert.ok(ids.includes("live.cdp_click"), `expected live.cdp_click in ${ids.join(", ")}`);
    });

    it("dispatch live.cdp_click dry run validates selector arg", async () => {
        const result = await dispatchAction("live.cdp_click", { selector: "#does-not-matter-in-dry-run" }, { dryRun: true });
        assert.equal(result.status, "success");
        assert.equal(result.action_id, "live.cdp_click");
        assert.equal(result.dry_run, true);
        // Should include validated args shape
        assert.deepEqual((result as { validated_args?: unknown }).validated_args, { selector: "#does-not-matter-in-dry-run" });
    });

    it("dispatch live.cdp_click rejects unknown argument", async () => {
        const result = await dispatchAction("live.cdp_click", { selector: "#x", nope: true } as unknown as Record<string, unknown>);
        assert.equal(result.status, "error");
        assert.equal(result.code, "validation_error");
    });
});
