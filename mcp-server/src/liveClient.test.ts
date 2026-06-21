import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withTimeout } from "./utils/liveClient.js";

describe("gallery live MCP client timeouts", () => {
    it("rejects an operation that never settles", async () => {
        await assert.rejects(
            withTimeout(new Promise<never>(() => undefined), 10, "connection timed out"),
            /connection timed out/,
        );
    });

    it("clears the timeout when the operation settles", async () => {
        await assert.doesNotReject(
            withTimeout(Promise.resolve("ok"), 10, "should not fire"),
        );
    });
});
