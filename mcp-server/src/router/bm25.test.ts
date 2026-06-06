import assert from "node:assert/strict";
import test from "node:test";

import { buildGalleryCatalog } from "../catalog/buildCatalog.js";
import { Bm25Index } from "./bm25.js";

test("BM25 ranks exact tool name above unrelated query", () => {
    const catalog = buildGalleryCatalog();
    const index = new Bm25Index(catalog.tools, catalog.field_weights);
    const hits = index.search("gallery_status", { limit: 5 });
    assert.ok(hits.length > 0);
    assert.equal(hits[0].entry.name, "gallery_status");
});

test("BM25 finds api health tools for backend health query", () => {
    const catalog = buildGalleryCatalog();
    const index = new Bm25Index(catalog.tools, catalog.field_weights);
    const hits = index.search("python webui health", { limit: 5, domain: "api" });
    assert.ok(hits.some((h) => h.entry.name === "api_health"));
});

test("BM25 domain filter excludes live tools from api search", () => {
    const catalog = buildGalleryCatalog();
    const index = new Bm25Index(catalog.tools, catalog.field_weights);
    const hits = index.search("screenshot", { limit: 5, domain: "api" });
    assert.ok(!hits.some((h) => h.entry.name === "cdp_screenshot"));
});
