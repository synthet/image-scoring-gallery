#!/usr/bin/env node
/**
 * driftara — single entry point for Driftara Gallery (image-scoring-gallery).
 *
 *   node dist/driftara.js            stdio MCP server: search, resolve, execute
 *   node dist/driftara.js search ... CLI over the same catalog
 *
 * ipc.* actions are forwarded to the live server inside the running gallery app (gallery-mcp.lock).
 * Contract: docs/technical/DRIFTARA_MCP.md
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CliUsageError, formatResult, parseCliArgs, USAGE } from "./driftara/cli.js";
import { DRIFTARA_VERSION, DriftaraService, type DriftaraRuntime } from "./driftara/service.js";
import { callDriftaraTool, createDriftaraServer } from "./createDriftaraServer.js";
import { DRIFTARA } from "./names.js";
import { callLiveExecute } from "./utils/liveClient.js";

/** stdio / CLI runtime: no Electron hooks, so ipc.* goes to the live server. */
export function stdioRuntime(): DriftaraRuntime {
    return { forwardToLive: (args) => callLiveExecute(args) };
}

export async function runMcpServer(serverName: string = DRIFTARA): Promise<void> {
    const { server, toolDefs } = createDriftaraServer({ serverName, runtime: stdioRuntime() });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${serverName} MCP v${DRIFTARA_VERSION} — tools: ${toolDefs.map((t) => t.name).join(", ")}`);
}

/** Old entry points (is-ui-mcp, is-ui-router, ...) start driftara under their old name. */
export async function runDeprecatedShim(oldName: string, entry: string): Promise<void> {
    console.error(`[deprecated] ${oldName} (${entry}) now serves driftara; switch your MCP config to the 'driftara' key (node mcp-server/dist/driftara.js). See docs/technical/DRIFTARA_MCP.md`);
    await runMcpServer(oldName);
}

export async function runCli(argv: string[]): Promise<number> {
    let cmd;
    try {
        cmd = parseCliArgs(argv);
    } catch (err) {
        if (err instanceof CliUsageError) {
            process.stderr.write(`driftara: ${err.message}\n\n${USAGE}`);
            return 2;
        }
        throw err;
    }
    if (cmd.command === "help") {
        process.stdout.write(USAGE);
        return 0;
    }
    if (cmd.command === "mcp") {
        await runMcpServer();
        return -1; // keep running
    }
    const service = new DriftaraService(stdioRuntime());
    const result = await callDriftaraTool(service, cmd.tool ?? "", cmd.args);
    process.stdout.write(formatResult(cmd, result) + "\n");
    return result.status === "error" ? 1 : 0;
}

const entryScript = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = entryScript === fileURLToPath(import.meta.url) || /driftara(\.js)?$/.test(entryScript.replace(/\\/g, "/"));
if (isMain) {
    runCli(process.argv.slice(2))
        .then((code) => {
            if (code >= 0) process.exit(code);
        })
        .catch((error) => {
            console.error("driftara fatal error:", error);
            process.exit(1);
        });
}
