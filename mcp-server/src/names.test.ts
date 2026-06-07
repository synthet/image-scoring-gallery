import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DISPATCH,
    PROFILE_SERVER,
    SEARCH,
    UI_API,
    UI_FULL,
    UI_LIVE,
    UI_LOCAL,
    UI_MCP,
    UI_ROUTER,
    serverForProfile,
} from "./names.js";

describe("gallery MCP server names", () => {
    it("exports canonical is-ui-* constants", () => {
        assert.equal(UI_MCP, "is-ui-mcp");
        assert.equal(UI_ROUTER, "is-ui-router");
        assert.equal(UI_LOCAL, "is-ui-local");
        assert.equal(UI_API, "is-ui-api");
        assert.equal(UI_LIVE, "is-ui-live");
        assert.equal(UI_FULL, "is-ui-full");
        assert.equal(SEARCH, "search");
        assert.equal(DISPATCH, "dispatch");
    });

    it("maps profiles to server keys", () => {
        assert.equal(PROFILE_SERVER.mcp, UI_MCP);
        assert.equal(PROFILE_SERVER.compact, UI_MCP);
        assert.equal(PROFILE_SERVER.local, UI_LOCAL);
        assert.equal(PROFILE_SERVER.api, UI_API);
        assert.equal(PROFILE_SERVER.live, UI_LIVE);
        assert.equal(PROFILE_SERVER.full, UI_FULL);
        assert.equal(PROFILE_SERVER.router, UI_ROUTER);
        assert.equal(serverForProfile("local"), "is-ui-local");
        assert.equal(serverForProfile("unknown"), "is-ui-unknown");
    });
});
