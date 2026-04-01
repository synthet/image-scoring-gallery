import { resolveApiUrl } from "../utils/config.js";

interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

interface ToolResult {
    [key: string]: unknown;
    content: { type: string; text: string }[];
    isError?: boolean;
}

async function apiFetch(path: string, timeout = 5000): Promise<unknown> {
    const baseUrl = await resolveApiUrl();
    const url = `${baseUrl}${path}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
    return resp.json();
}

function assertSafeRelativePath(path: string): string {
    const p = path.trim();
    if (!p.startsWith("/")) throw new Error("path must start with /");
    if (p.includes("..") || p.includes("://") || p.includes("\n") || p.includes("\r")) {
        throw new Error("invalid path");
    }
    if (p.length > 512) throw new Error("path too long");
    return p;
}

export const apiToolDefs: ToolDef[] = [
    {
        name: "api_health",
        description:
            "Check if the Python scoring backend (FastAPI) is running. Returns health status, loaded models, and GPU availability.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "api_job_status",
        description:
            "Get recent background jobs or one job by id. job_id is the integer jobs.id — the same as workflow run_id used in POST/GET /api/runs/{run_id}/... (e.g. GET /api/jobs/296 for run 296).",
        inputSchema: {
            type: "object",
            properties: {
                job_id: {
                    type: "string",
                    description:
                        "Optional numeric job id as string (same as run_id). Omit to list recent jobs via GET /api/jobs/recent.",
                },
            },
        },
    },
    {
        name: "api_run_stages",
        description:
            "GET /api/runs/{run_id}/stages — all pipeline stages for a workflow run (same id as jobs.id / api_job_status job_id).",
        inputSchema: {
            type: "object",
            properties: {
                run_id: {
                    type: "string",
                    description: "Workflow run id (integer as string), same as jobs.id.",
                },
            },
            required: ["run_id"],
        },
    },
    {
        name: "api_probe",
        description:
            "GET a relative path on the scoring WebUI (same base URL as other API tools) and return status, elapsed ms, and a short body preview. Use for slow endpoints (e.g. /api/scope/tree). path must start with / and must not contain ..",
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Relative URL path, e.g. /api/health or /api/scope/tree",
                },
                timeout_ms: {
                    type: "number",
                    description: "Timeout in milliseconds (default 10000, max 120000)",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "api_runner_status",
        description:
            "Get the current status of all background runners (scoring, tagging, clustering) — whether they are idle, running, or errored, and their progress.",
        inputSchema: { type: "object", properties: {} },
    },
];

export async function handleApiTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
        if (name === "api_health") {
            const [health, status] = await Promise.allSettled([
                apiFetch("/api/health"),
                apiFetch("/api/status"),
            ]);

            const result: Record<string, unknown> = {};
            if (health.status === "fulfilled") result.health = health.value;
            else result.health_error = health.reason?.message;
            if (status.status === "fulfilled") result.status = status.value;
            else result.status_error = status.reason?.message;

            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "api_job_status") {
            const jobId = args?.job_id as string | undefined;
            if (jobId) {
                const job = await apiFetch(`/api/jobs/${encodeURIComponent(String(jobId).trim())}`);
                return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
            }
            const jobs = await apiFetch("/api/jobs/recent");
            return { content: [{ type: "text", text: JSON.stringify(jobs, null, 2) }] };
        }

        if (name === "api_run_stages") {
            const runId = String((args?.run_id as string | number | undefined) ?? "").trim();
            if (!runId) throw new Error("run_id is required");
            const stages = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/stages`);
            return { content: [{ type: "text", text: JSON.stringify(stages, null, 2) }] };
        }

        if (name === "api_probe") {
            const rawPath = assertSafeRelativePath(String(args?.path ?? ""));
            let timeoutMs = 10000;
            if (typeof args?.timeout_ms === "number" && Number.isFinite(args.timeout_ms)) {
                timeoutMs = Math.min(120000, Math.max(100, Math.floor(args.timeout_ms)));
            }
            const baseUrl = await resolveApiUrl();
            const url = `${baseUrl}${rawPath}`;
            const t0 = Date.now();
            try {
                const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
                const elapsedMs = Date.now() - t0;
                const body = await resp.text();
                const preview = body.length > 4000 ? `${body.slice(0, 4000)}…` : body;
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    url,
                                    status_code: resp.status,
                                    elapsed_ms: elapsedMs,
                                    content_length_header: resp.headers.get("content-length"),
                                    body_chars: body.length,
                                    body_preview: preview,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            } catch (error: unknown) {
                const elapsedMs = Date.now() - t0;
                const msg = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ url, error: msg, elapsed_ms: elapsedMs }, null, 2),
                        },
                    ],
                };
            }
        }

        if (name === "api_runner_status") {
            const [scoring, tagging, clustering] = await Promise.allSettled([
                apiFetch("/api/scoring/status"),
                apiFetch("/api/tagging/status"),
                apiFetch("/api/clustering/status"),
            ]);

            const result: Record<string, unknown> = {};
            for (const [key, settled] of [["scoring", scoring], ["tagging", tagging], ["clustering", clustering]] as const) {
                if (settled.status === "fulfilled") result[key] = settled.value;
                else result[key] = { error: (settled as PromiseRejectedResult).reason?.message };
            }

            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        throw new Error(`Unknown API tool: ${name}`);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
            return {
                content: [{ type: "text", text: `Backend API is not reachable. Is the Python server running?\nError: ${msg}` }],
                isError: true,
            };
        }
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
}
