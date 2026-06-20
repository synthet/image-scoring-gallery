import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { needsLiveSseProxy, shouldProxyAfterLocal } from "./utils/proxyDispatch.js";

describe("gallery MCP live proxy routing", () => {
    it("needsLiveSseProxy for live_ipc handler domain", () => {
        assert.equal(
            needsLiveSseProxy("live.gallery_window_status", {
                action_id: "live.gallery_window_status",
                handler_domain: "live_ipc",
            } as never),
            true,
        );
    });

    it("does not proxy live_cdp by default", () => {
        assert.equal(
            needsLiveSseProxy("live.cdp_click", {
                action_id: "live.cdp_click",
                handler_domain: "live_cdp",
            } as never),
            false,
        );
    });

    it("respects MCP_LIVE_PROXY_PREFIXES", () => {
        process.env.MCP_LIVE_PROXY_PREFIXES = "live.";
        try {
            assert.equal(
                needsLiveSseProxy("live.cdp_click", {
                    action_id: "live.cdp_click",
                    handler_domain: "live_cdp",
                } as never),
                true,
            );
            assert.equal(needsLiveSseProxy("local.gallery_status"), false);
        } finally {
            delete process.env.MCP_LIVE_PROXY_PREFIXES;
        }
    });

    it("shouldProxyAfterLocal for unknown_action", () => {
        assert.equal(
            shouldProxyAfterLocal("nope.missing", { status: "error", code: "unknown_action" }),
            true,
        );
        assert.equal(
            shouldProxyAfterLocal("local.gallery_status", { status: "success" }),
            false,
        );
    });
});
