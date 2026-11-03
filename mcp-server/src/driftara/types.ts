import type { Tier } from "./policy.js";

export const SOURCES = ["local", "ipc", "cdp", "api", "system"] as const;
export type Source = (typeof SOURCES)[number];

export type Executor =
    | { kind: "tool"; tool: string }
    | { kind: "live_hook"; tool: string }
    | { kind: "system"; name: string }
    | {
          kind: "ipc";
          channel: string;
          /** Positional handler parameters after the event: a named argument, or an object built from keys. */
          params: Array<{ name: string } | { keys: string[] }>;
          /** Handler wraps its result in wrapIpcHandler's { ok, data, error }. */
          wrapped: boolean;
          file: string;
      };

/** One catalog record (same shape as vexlum's). */
export interface DriftaraRecord {
    action_id: string;
    source: Source;
    category: string;
    title: string;
    description: string;
    tags: string[];
    aliases: string[];
    intent_examples: string[];
    input_schema: Record<string, unknown>;
    tier: Tier;
    native_dry_run: boolean;
    executor: Executor;
    legacy_tool_name: string | null;
    canonical_docs: string[];
    notes: string[];
}

export interface DriftaraCatalogFile {
    version: number;
    field_weights: Record<string, number>;
    actions: DriftaraRecord[];
}

export type Envelope = Record<string, unknown> & { status: string };
