#!/usr/bin/env node
/** Generate mcp-server/tool_catalog.json from ToolDef modules + overlay JSON. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildGalleryCatalog, catalogPath } from "../dist/catalog/buildCatalog.js";

const outPath = process.argv[2] ?? catalogPath();

const catalog = buildGalleryCatalog();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n", "utf-8");
console.error(`Wrote ${outPath} (${catalog.tools.length} tools)`);
