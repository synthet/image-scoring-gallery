import { randomUUID } from "node:crypto";

import { executeGalleryTool } from "../createGalleryMcpServer.js";
import { requireAction } from "./registry.js";
import { validateArguments } from "./schema.js";

function toolResultToData(result: {
    content: { type: string; text?: string; data?: string; mimeType?: string }[];
    isError?: boolean;
}): { data: unknown; isError: boolean } {
    if (result.isError) {
        const text = result.content.map((c) => c.text ?? "").join("\n");
        return { data: { message: text }, isError: true };
    }
    const parts = result.content.map((c) => {
        if (c.type === "text") return c.text ?? "";
        if (c.type === "image") {
            return { type: "image", mimeType: c.mimeType, data_length: (c.data ?? "").length };
        }
        return c;
    });
    if (parts.length === 1 && typeof parts[0] === "string") {
        try {
            return { data: JSON.parse(parts[0]), isError: false };
        } catch {
            return { data: parts[0], isError: false };
        }
    }
    return { data: parts, isError: false };
}

export interface DispatchOptions {
    dryRun?: boolean;
    confirmed?: boolean;
    requestId?: string;
    expectedVersion?: number;
}

function errorEnvelope(
    actionId: string,
    requestId: string,
    code: string,
    message: string,
): Record<string, unknown> {
    return {
        action_id: actionId,
        request_id: requestId,
        status: "error",
        code,
        message,
    };
}

export async function dispatchAction(
    actionId: string,
    args: Record<string, unknown> | null = null,
    opts: DispatchOptions = {},
): Promise<Record<string, unknown>> {
    const requestId = (opts.requestId ?? "").trim() || randomUUID();
    try {
        const record = requireAction(actionId);
        if (!record.dispatch_enabled) {
            return errorEnvelope(actionId, requestId, "policy_rejected", "Action is not dispatchable.");
        }
        if (record.deprecated) {
            return errorEnvelope(actionId, requestId, "deprecated", "Action is deprecated.");
        }
        if (opts.expectedVersion != null && opts.expectedVersion !== record.version) {
            return errorEnvelope(actionId, requestId, "version_mismatch", "Action version mismatch.");
        }
        if (record.confirmation_required && !opts.confirmed) {
            return errorEnvelope(actionId, requestId, "confirmation_required", "Confirmation required.");
        }

        const validated = validateArguments(record.input_schema, args ?? {});

        if (opts.dryRun) {
            return {
                action_id: actionId,
                action_version: record.version,
                request_id: requestId,
                status: "success",
                dry_run: true,
                side_effect_level: record.side_effect_level,
                validated_args: validated,
            };
        }

        const toolResult = await executeGalleryTool(record.legacy_tool_name, validated);
        const { data, isError } = toolResultToData(toolResult);
        if (isError) {
            return errorEnvelope(
                actionId,
                requestId,
                "handler_error",
                typeof data === "object" && data && "message" in data
                    ? String((data as { message: string }).message)
                    : "Tool returned an error.",
            );
        }
        return {
            action_id: actionId,
            action_version: record.version,
            request_id: requestId,
            status: "success",
            side_effect_level: record.side_effect_level,
            dry_run: false,
            summary: `${record.title} completed.`,
            data,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith("Unknown action:")) {
            return errorEnvelope(actionId, requestId, "unknown_action", message);
        }
        if (message.includes("Missing required") || message.includes("Unknown argument")) {
            return errorEnvelope(actionId, requestId, "validation_error", message);
        }
        return errorEnvelope(actionId, requestId, "internal_error", message);
    }
}
