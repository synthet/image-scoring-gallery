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
});
