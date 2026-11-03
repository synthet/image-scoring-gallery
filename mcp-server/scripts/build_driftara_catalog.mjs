#!/usr/bin/env node
/**
 * Build mcp-server/driftara/catalog.json, the single driftara action catalog.
 *
 *   node scripts/build_driftara_catalog.mjs              write catalog.json
 *   node scripts/build_driftara_catalog.mjs --check      exit 1 when catalog.json is stale
 *   node scripts/build_driftara_catalog.mjs --update-doc rewrite the catalog block in docs/technical/DRIFTARA_MCP.md
 *   node scripts/build_driftara_catalog.mjs --check-doc  exit 1 when that block is stale
 *
 * Sources:
 *   ipc     every ipcMain.handle channel under electron/ (TypeScript compiler scan: channel, parameter
 *           names and types -> JSON Schema)
 *   local / api / cdp  the existing records in action_registry.json (ids unchanged)
 *   system  driftara itself
 * Hand-written metadata (tier, aliases, intent examples, notes) comes from driftara/overrides.json.
 * Uses the repo root's `typescript` so the scan matches `npm run typecheck`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MCP_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(MCP_ROOT, "..");
const ELECTRON_DIR = path.join(REPO_ROOT, "electron");
export const CATALOG_PATH = path.join(MCP_ROOT, "driftara", "catalog.json");
const OVERRIDES_PATH = path.join(MCP_ROOT, "driftara", "overrides.json");
const REGISTRY_PATH = path.join(MCP_ROOT, "action_registry.json");
const DOC_PATH = path.join(REPO_ROOT, "docs", "technical", "DRIFTARA_MCP.md");
const CONTRACT_DOC = "docs/technical/DRIFTARA_MCP.md";

export const TIERS = ["read", "write", "destructive"];
export const SOURCES = ["local", "ipc", "cdp", "api", "system"];
const MAX_OBJECT_DEPTH = 2;
const MAX_PROPERTIES = 40;

export const FIELD_WEIGHTS = {
    action_id: 4.0,
    title: 3.0,
    aliases: 2.5,
    intent_examples: 2.5,
    tags: 2.0,
    argument_names: 1.5,
    description: 1.0,
};

const require = createRequire(path.join(REPO_ROOT, "package.json"));

function loadTypeScript() {
    try {
        return require("typescript");
    } catch {
        throw new Error("typescript not found at the repo root: run `npm ci` in the repo root first");
    }
}

function readJson(p) {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ---------------------------------------------------------------------------
// IPC scan
// ---------------------------------------------------------------------------

function groupForFile(file) {
    const base = path.basename(file, ".ts");
    const m = /^register(\w+)Handlers$/.exec(base);
    if (m) return m[1].replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    return base.replace(/\W+/g, "_").toLowerCase();
}

function isSourceFile(file) {
    return file.endsWith(".ts") && !file.endsWith(".d.ts") && !/\.(test|spec)\.ts$/.test(file);
}

function walkDir(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === "node_modules" ? [] : walkDir(p);
        return isSourceFile(p) ? [p] : [];
    });
}

function createSchemaConverter(ts, checker) {
    const typeText = (type) => checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);

    function literalBase(t) {
        if (t.flags & ts.TypeFlags.StringLiteral) return "string";
        if (t.flags & ts.TypeFlags.NumberLiteral) return "number";
        return null;
    }

    function convert(type, depth) {
        const f = type.flags;
        if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
        if (f & ts.TypeFlags.Null) return { type: "null" };
        if (f & ts.TypeFlags.StringLiteral) return { type: "string", enum: [type.value] };
        if (f & ts.TypeFlags.NumberLiteral) return { type: "number", enum: [type.value] };
        if (f & ts.TypeFlags.BooleanLiteral) return { type: "boolean" };
        if (f & ts.TypeFlags.String) return { type: "string" };
        if (f & ts.TypeFlags.Number) return { type: "number" };
        if (f & ts.TypeFlags.Boolean) return { type: "boolean" };
        if (type.isUnion()) {
            const members = type.types.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
            const out = [];
            let sawBool = false;
            const literals = new Map();
            for (const m of members) {
                if (m.flags & ts.TypeFlags.BooleanLiteral) {
                    if (!sawBool) out.push({ type: "boolean" });
                    sawBool = true;
                    continue;
                }
                const base = literalBase(m);
                if (base) {
                    if (!literals.has(base)) {
                        const entry = { type: base, enum: [] };
                        literals.set(base, entry);
                        out.push(entry);
                    }
                    literals.get(base).enum.push(m.value);
                    continue;
                }
                out.push(convert(m, depth));
            }
            if (out.some((s) => Object.keys(s).length === 0)) return {};
            return out.length === 1 ? out[0] : { anyOf: out };
        }
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            const args = checker.getTypeArguments(type);
            const items = args.length === 1 ? convert(args[0], depth + 1) : {};
            return { type: "array", items };
        }
        if (f & ts.TypeFlags.Object) {
            const sym = type.getSymbol();
            if (sym && sym.getName() === "Date") return { type: "string", description: "date (ISO 8601)" };
            if (type.getCallSignatures().length) return { description: `TS: ${typeText(type)}` };
            if (depth >= MAX_OBJECT_DEPTH) return { type: "object", description: `TS: ${typeText(type)}` };
            const props = checker.getPropertiesOfType(type);
            const schema = { type: "object" };
            const properties = {};
            const required = [];
            for (const prop of props.slice(0, MAX_PROPERTIES)) {
                const decl = prop.valueDeclaration ?? prop.declarations?.[0];
                const propType = decl ? checker.getTypeOfSymbolAtLocation(prop, decl) : checker.getDeclaredTypeOfSymbol(prop);
                if (propType.getCallSignatures().length) continue;
                properties[prop.getName()] = convert(propType, depth + 1);
                const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0 || (propType.isUnion() && propType.types.some((t) => t.flags & ts.TypeFlags.Undefined));
                if (!optional) required.push(prop.getName());
            }
            if (Object.keys(properties).length) schema.properties = properties;
            if (required.length) schema.required = required;
            if (checker.getIndexInfosOfType(type).length) schema.additionalProperties = true;
            return schema;
        }
        return { description: `TS: ${typeText(type)}` };
    }

    function acceptsUndefined(type) {
        if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return true;
        return type.isUnion() && type.types.some((t) => t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void));
    }

    return { convert, acceptsUndefined, typeText };
}

function unwrapExpression(ts, node) {
    let n = node;
    while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression?.(n))) n = n.expression;
    return n;
}

function channelsFromLoopTable(ts, callNode) {
    let p = callNode.parent;
    while (p && !ts.isForOfStatement(p)) p = p.parent;
    if (!p) throw new Error("ipcMain.handle(channel, ...) outside a for-of channel table");
    const init = p.initializer;
    const decl = ts.isVariableDeclarationList(init) ? init.declarations[0] : null;
    if (!decl || !ts.isArrayBindingPattern(decl.name)) throw new Error("channel table: expected `for (const [channel, ...] of [...])`");
    const table = unwrapExpression(ts, p.expression);
    if (!ts.isArrayLiteralExpression(table)) throw new Error("channel table: expected an array literal");
    return table.elements.map((row) => {
        const r = unwrapExpression(ts, row);
        if (!ts.isArrayLiteralExpression(r) || !ts.isStringLiteralLike(r.elements[0])) {
            throw new Error("channel table: each row must start with a string literal channel");
        }
        return r.elements[0].text;
    });
}

function leadingComment(ts, sf, node) {
    let n = node;
    while (n.parent && !ts.isExpressionStatement(n) && !ts.isSourceFile(n.parent)) n = n.parent;
    const ranges = ts.getLeadingCommentRanges(sf.text, n.getFullStart()) ?? [];
    const text = ranges
        .map((r) => sf.text.slice(r.pos, r.end))
        .join("\n")
        .replace(/^\s*\/\*\*?|\*\/\s*$/g, "")
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(\/\/+|\*)\s?/, "").trim())
        .filter(Boolean)
        .join(" ");
    return text || null;
}

export function scanIpcHandlers() {
    const ts = loadTypeScript();
    const configPath = path.join(ELECTRON_DIR, "tsconfig.json");
    const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
    if (cfg.error) throw new Error(ts.flattenDiagnosticMessageText(cfg.error.messageText, "\n"));
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ELECTRON_DIR);
    const files = walkDir(ELECTRON_DIR).sort();
    const program = ts.createProgram(files, { ...parsed.options, noEmit: true });
    const checker = program.getTypeChecker();
    const conv = createSchemaConverter(ts, checker);
    const out = [];
    const UNTYPED = "untyped in the handler and in electron/preload.ts";

    // Untyped handler parameters fall back to the type of the matching ipcRenderer.invoke argument in
    // preload.ts (the preload functions are typed): invoke argument i <-> handler parameter i.
    const preloadArgTypes = new Map();
    const preloadMethods = new Map();
    const preload = program.getSourceFile(path.join(ELECTRON_DIR, "preload.ts"));
    if (preload) {
        const visitPreload = (node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === "invoke" &&
                node.expression.expression.getText(preload) === "ipcRenderer" &&
                node.arguments[0] &&
                ts.isStringLiteralLike(node.arguments[0]) &&
                !preloadArgTypes.has(node.arguments[0].text)
            ) {
                const channel = node.arguments[0].text;
                preloadArgTypes.set(channel, node.arguments.slice(1).map((a) => checker.getTypeAtLocation(a)));
                // Renderer-facing name: the window.electron.<method> property that wraps this invoke.
                let p = node.parent;
                while (p && !ts.isPropertyAssignment(p) && !ts.isMethodDeclaration(p)) p = p.parent;
                if (p && p.name) preloadMethods.set(channel, p.name.getText(preload));
            }
            ts.forEachChild(node, visitPreload);
        };
        visitPreload(preload);
    }

    for (const file of files) {
        const sf = program.getSourceFile(file);
        if (!sf) continue;
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
        const visit = (node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === "handle" &&
                /(^|\.)ipcMain$/.test(node.expression.expression.getText(sf))
            ) {
                const [chanArg, fnArg] = node.arguments;
                const channels = ts.isStringLiteralLike(chanArg) ? [chanArg.text] : channelsFromLoopTable(ts, node);
                let fn = fnArg;
                let wrapped = false;
                if (fn && ts.isCallExpression(fn) && ts.isIdentifier(fn.expression) && fn.expression.text === "wrapIpcHandler") {
                    wrapped = true;
                    fn = fn.arguments[0];
                }
                if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
                    throw new Error(`${rel}: handler for ${channels.join(", ")} is not an inline function`);
                }
                const comment = leadingComment(ts, sf, node);
                for (const channel of channels) {
                    const params = [];
                    const properties = {};
                    const required = [];
                    const addProp = (name, schema, isRequired) => {
                        if (name in properties) throw new Error(`${rel}: ${channel} has two arguments named '${name}'`);
                        properties[name] = schema;
                        if (isRequired) required.push(name);
                    };
                    fn.parameters.slice(1).forEach((param, i) => {
                        const optional = Boolean(param.questionToken || param.initializer || param.dotDotDotToken);
                        const declared = param.type ? checker.getTypeFromTypeNode(param.type) : null;
                        const fromPreload = preloadArgTypes.get(channel)?.[i] ?? null;
                        // A handler annotated `unknown` validates at runtime; the preload type is more useful.
                        const usable = (t) => t && !(t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
                        const type = usable(declared) ? declared : usable(fromPreload) ? fromPreload : null;
                        if (ts.isIdentifier(param.name)) {
                            const schema = type ? conv.convert(type, 0) : { description: UNTYPED };
                            addProp(param.name.text, schema, Boolean(type) && !optional && !conv.acceptsUndefined(type));
                            params.push({ name: param.name.text });
                        } else if (ts.isObjectBindingPattern(param.name)) {
                            const keys = [];
                            for (const el of param.name.elements) {
                                const key = (el.propertyName ?? el.name).getText(sf);
                                keys.push(key);
                                let schema = { description: UNTYPED };
                                let req = false;
                                const prop = type ? checker.getPropertyOfType(type, key) : null;
                                if (prop) {
                                    const t = checker.getTypeOfSymbolAtLocation(prop, param);
                                    schema = conv.convert(t, 1);
                                    req = !optional && (prop.flags & ts.SymbolFlags.Optional) === 0 && !conv.acceptsUndefined(t);
                                }
                                addProp(key, schema, req);
                            }
                            params.push({ keys });
                        } else {
                            throw new Error(`${rel}: ${channel} uses an array binding parameter`);
                        }
                    });
                    out.push({
                        channel,
                        file: rel,
                        group: groupForFile(file),
                        wrapped,
                        params,
                        properties,
                        required,
                        comment,
                        preloadMethod: preloadMethods.get(channel) ?? null,
                    });
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Catalog assembly
// ---------------------------------------------------------------------------

export function ipcActionId(channel) {
    return `ipc.${channel.replace(/:/g, ".")}`;
}

function words(s) {
    return s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
}

function uniq(list) {
    return [...new Set(list.filter(Boolean))];
}

function validateTier(tier, where) {
    if (!TIERS.includes(tier)) throw new Error(`${where}: tier must be one of ${TIERS.join("|")}, got ${JSON.stringify(tier)}`);
}

function buildIpcRecords(scan, overrides) {
    const ov = overrides.ipc ?? {};
    const seen = new Set();
    const records = [];
    for (const h of scan) {
        if (seen.has(h.channel)) throw new Error(`channel ${h.channel} is registered twice`);
        seen.add(h.channel);
        const o = ov[h.channel] ?? {};
        const tier = o.tier ?? "write";
        validateTier(tier, `overrides.ipc[${h.channel}]`);
        const [prefix, ...restParts] = h.channel.split(":");
        const schema = { type: "object", properties: h.properties };
        if (h.required.length) schema.required = h.required;
        schema.additionalProperties = false;
        // Overrides may refine a scanned argument's schema or the required list, never rename arguments:
        // the executor rebuilds the positional IPC call from the scanned names.
        for (const [name, s] of Object.entries(o.properties ?? {})) {
            if (!(name in schema.properties)) throw new Error(`overrides.ipc[${h.channel}].properties.${name}: no such handler argument`);
            schema.properties[name] = s;
        }
        if (o.required) {
            for (const name of o.required) {
                if (!(name in schema.properties)) throw new Error(`overrides.ipc[${h.channel}].required: no such argument '${name}'`);
            }
            schema.required = o.required;
        }
        records.push({
            action_id: ipcActionId(h.channel),
            source: "ipc",
            category: `ipc.${h.group}`,
            title: o.title ?? `${prefix}: ${restParts.join(" ").replace(/-/g, " ")}`.trim(),
            description:
                o.description ??
                [
                    h.comment,
                    `Electron IPC channel '${h.channel}'` +
                        (h.preloadMethod ? `, window.electron.${h.preloadMethod}() in the renderer` : "") +
                        ` (${path.basename(h.file)}).`,
                ]
                    .filter(Boolean)
                    .join(" "),
            tags: uniq([
                "ipc",
                h.group,
                ...words(h.channel),
                ...(h.preloadMethod ? words(h.preloadMethod.replace(/([a-z0-9])([A-Z])/g, "$1 $2")) : []),
                ...(o.tags ?? []),
            ]).sort(),
            aliases: uniq([h.channel, ...(o.aliases ?? [])]),
            intent_examples: o.intent_examples ?? [],
            input_schema: schema,
            tier,
            native_dry_run: false,
            executor: { kind: "ipc", channel: h.channel, params: h.params, wrapped: h.wrapped, file: h.file },
            legacy_tool_name: null,
            canonical_docs: [CONTRACT_DOC],
            notes: o.notes ?? [],
        });
    }
    for (const channel of Object.keys(ov)) {
        if (!seen.has(channel)) throw new Error(`overrides.ipc has '${channel}', which no ipcMain.handle registers`);
    }
    return records;
}

function registrySource(rec) {
    if (rec.handler_domain === "local") return { source: "local", category: "local", kind: "tool" };
    if (rec.handler_domain === "api") return { source: "api", category: "api", kind: "tool" };
    if (rec.handler_domain === "live_cdp") return { source: "cdp", category: "cdp", kind: "tool" };
    if (rec.handler_domain === "live_ipc") return { source: "ipc", category: "ipc.live", kind: "live_hook" };
    throw new Error(`unknown handler_domain ${rec.handler_domain} on ${rec.action_id}`);
}

function buildRegistryRecords(registry, overrides) {
    const ov = overrides.actions ?? {};
    return registry.actions.map((rec) => {
        const s = registrySource(rec);
        const o = ov[rec.action_id] ?? {};
        const tier = o.tier ?? "read";
        validateTier(tier, `overrides.actions[${rec.action_id}]`);
        return {
            action_id: rec.action_id,
            source: s.source,
            category: s.category,
            title: o.title ?? rec.title,
            description: o.description ?? rec.description,
            tags: uniq([...(rec.tags ?? []), ...(o.tags ?? [])]).sort(),
            aliases: uniq([...(rec.aliases ?? []), ...(o.aliases ?? [])]),
            intent_examples: uniq([...(rec.intent_examples ?? []), ...(o.intent_examples ?? [])]),
            input_schema: rec.input_schema,
            tier,
            native_dry_run: false,
            executor: { kind: s.kind, tool: rec.legacy_tool_name },
            legacy_tool_name: rec.legacy_tool_name,
            canonical_docs: [CONTRACT_DOC],
            notes: o.notes ?? [],
        };
    });
}

function systemRecords() {
    const empty = { type: "object", properties: {}, additionalProperties: false };
    return [
        {
            action_id: "system.categories",
            source: "system",
            category: "system",
            title: "Catalog categories",
            description: "Action counts per category, source and tier in the driftara catalog.",
            tags: ["catalog", "categories", "driftara", "system"],
            aliases: ["list categories"],
            intent_examples: ["what can driftara do", "which categories exist"],
            input_schema: empty,
            tier: "read",
            native_dry_run: false,
            executor: { kind: "system", name: "categories" },
            legacy_tool_name: null,
            canonical_docs: [CONTRACT_DOC],
            notes: [],
        },
        {
            action_id: "system.status",
            source: "system",
            category: "system",
            title: "driftara status",
            description:
                "Catalog counts plus reachability of the gallery live server (ipc.*), Electron CDP (live.cdp_*) and the backend API (api.*).",
            tags: ["driftara", "health", "live", "status", "system"],
            aliases: ["sse status", "live status", "driftara health"],
            intent_examples: ["is the gallery app running", "driftara health", "is the live server up"],
            input_schema: empty,
            tier: "read",
            native_dry_run: false,
            executor: { kind: "system", name: "status" },
            legacy_tool_name: "sse_status",
            canonical_docs: [CONTRACT_DOC],
            notes: [],
        },
    ];
}

export function buildCatalog() {
    const overrides = readJson(OVERRIDES_PATH);
    for (const [id, o] of Object.entries(overrides.actions ?? {})) {
        if (!readJson(REGISTRY_PATH).actions.some((a) => a.action_id === id)) {
            throw new Error(`overrides.actions has '${id}', which is not in action_registry.json`);
        }
        if (o.tier) validateTier(o.tier, `overrides.actions[${id}]`);
    }
    const actions = [
        ...buildRegistryRecords(readJson(REGISTRY_PATH), overrides),
        ...buildIpcRecords(scanIpcHandlers(), overrides),
        ...systemRecords(),
    ].sort((a, b) => a.action_id.localeCompare(b.action_id));
    const ids = new Set();
    for (const a of actions) {
        if (ids.has(a.action_id)) throw new Error(`duplicate action_id ${a.action_id}`);
        ids.add(a.action_id);
    }
    return {
        version: 1,
        generated_by: "mcp-server/scripts/build_driftara_catalog.mjs (do not edit; change driftara/overrides.json)",
        field_weights: FIELD_WEIGHTS,
        actions,
    };
}

export function renderCatalog(catalog) {
    return JSON.stringify(catalog, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Doc block (port of vexlum's render_vexlum_block)
// ---------------------------------------------------------------------------

const BEGIN = "<!-- BEGIN DRIFTARA CATALOG -->";
const END = "<!-- END DRIFTARA CATALOG -->";

export function renderDocBlock(catalog) {
    const counts = {};
    for (const a of catalog.actions) {
        counts[a.source] ??= { read: 0, write: 0, destructive: 0 };
        counts[a.source][a.tier] += 1;
    }
    const lines = [
        BEGIN,
        "_This section is auto-generated by `node mcp-server/scripts/build_driftara_catalog.mjs --update-doc`. Do not edit manually._",
        "",
        `Total actions: **${catalog.actions.length}**`,
        "",
        "| Source | read | write | destructive | Total |",
        "|---|---|---|---|---|",
    ];
    for (const source of Object.keys(counts).sort()) {
        const c = counts[source];
        lines.push(`| \`${source}\` | ${c.read} | ${c.write} | ${c.destructive} | ${c.read + c.write + c.destructive} |`);
    }
    lines.push(END);
    return lines.join("\n");
}

function docBlockRegex() {
    return new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
}

function main(argv) {
    const catalog = buildCatalog();
    const rendered = renderCatalog(catalog);
    const flag = argv[0];
    if (flag === "--check") {
        const current = fs.existsSync(CATALOG_PATH) ? fs.readFileSync(CATALOG_PATH, "utf-8").replace(/\r\n/g, "\n") : "";
        if (current !== rendered) {
            console.error(`${path.relative(REPO_ROOT, CATALOG_PATH)} is stale: run \`npm run build:driftara-catalog --prefix mcp-server\``);
            return 1;
        }
        console.log(`driftara catalog up to date (${catalog.actions.length} actions)`);
        return 0;
    }
    if (flag === "--check-doc" || flag === "--update-doc") {
        const doc = fs.readFileSync(DOC_PATH, "utf-8");
        const crlf = doc.includes("\r\n");
        const lf = doc.replace(/\r\n/g, "\n");
        const m = docBlockRegex().exec(lf);
        if (!m) {
            console.error(`${CONTRACT_DOC}: missing ${BEGIN} ... ${END}`);
            return 1;
        }
        const block = renderDocBlock(catalog);
        if (flag === "--check-doc") {
            if (m[0] !== block) {
                console.error(`${CONTRACT_DOC} catalog block is stale: run \`node mcp-server/scripts/build_driftara_catalog.mjs --update-doc\``);
                return 1;
            }
            console.log(`${CONTRACT_DOC} catalog block up to date`);
            return 0;
        }
        const next = lf.replace(docBlockRegex(), block);
        fs.writeFileSync(DOC_PATH, crlf ? next.replace(/\n/g, "\r\n") : next, "utf-8");
        console.log(`updated ${CONTRACT_DOC}`);
        return 0;
    }
    if (flag) {
        console.error(`unknown flag ${flag}`);
        return 2;
    }
    fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
    fs.writeFileSync(CATALOG_PATH, rendered, "utf-8");
    const tiers = { read: 0, write: 0, destructive: 0 };
    for (const a of catalog.actions) tiers[a.tier] += 1;
    console.log(`wrote ${path.relative(REPO_ROOT, CATALOG_PATH)}: ${catalog.actions.length} actions ${JSON.stringify(tiers)}`);
    return 0;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    try {
        process.exit(main(process.argv.slice(2)));
    } catch (err) {
        console.error(`build_driftara_catalog: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
