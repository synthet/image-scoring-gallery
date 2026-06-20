import type { ActionRecord } from "../actions/types.js";
import { actionById } from "../actions/registry.js";
import { dispatchAction, type DispatchOptions } from "../actions/dispatch.js";
import { callLiveDispatch } from "./liveClient.js";

function parseCsvEnv(name: string): Set<string> {
    const raw = process.env[name]?.trim();
    if (!raw) return new Set();
    return new Set(
        raw
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
    );
}

export function needsLiveSseProxy(actionId: string, record?: ActionRecord): boolean {
    if (record?.handler_domain === "live_ipc") return true;

    const allowIds = parseCsvEnv("MCP_LIVE_PROXY_ACTION_IDS");
    if (allowIds.has(actionId)) return true;

    for (const prefix of parseCsvEnv("MCP_LIVE_PROXY_PREFIXES")) {
        if (actionId.startsWith(prefix)) return true;
    }

    return false;
}

export function shouldProxyAfterLocal(
    actionId: string,
    localResult: Record<string, unknown>,
): boolean {
    if (localResult.status === "error" && localResult.code === "unknown_action") {
        return true;
    }
    return false;
}

export function liveUnavailableError(
    actionId: string,
    requestId: string | undefined,
    error: string,
): Record<string, unknown> {
    return {
        status: "error",
        code: "live_unavailable",
        message:
            "Gallery live MCP (is-ui-live) is unavailable. Start Electron dev (npm run dev) or set ENABLE_GALLERY_MCP_SSE=1; expected SSE URL is in gallery-mcp.lock or http://127.0.0.1:9373/mcp/sse.",
        action_id: actionId,
        request_id: requestId,
        details: { error },
    };
}

export async function dispatchWithLiveProxy(
    actionId: string,
    args: Record<string, unknown> | null,
    opts: DispatchOptions = {},
): Promise<Record<string, unknown>> {
    const requestId = opts.requestId;

    if (opts.dryRun) {
        return dispatchAction(actionId, args, opts);
    }

    const record = actionById(actionId);

    if (record && needsLiveSseProxy(actionId, record)) {
        try {
            return await callLiveDispatch({
                action_id: actionId,
                arguments: args ?? {},
                dry_run: false,
                confirmed: opts.confirmed === true,
                request_id: requestId,
                expected_version: opts.expectedVersion,
            });
        } catch (err) {
            return liveUnavailableError(
                actionId,
                requestId,
                err instanceof Error ? err.message : String(err),
            );
        }
    }

    const local = await dispatchAction(actionId, args, opts);

    if (!shouldProxyAfterLocal(actionId, local)) {
        return local;
    }

    try {
        return await callLiveDispatch({
            action_id: actionId,
            arguments: args ?? {},
            dry_run: false,
            confirmed: opts.confirmed === true,
            request_id: requestId,
            expected_version: opts.expectedVersion,
        });
    } catch (err) {
        return liveUnavailableError(
            actionId,
            requestId,
            err instanceof Error ? err.message : String(err),
        );
    }
}
