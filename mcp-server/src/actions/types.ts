export interface ActionRecord {
    action_id: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    aliases?: string[];
    intent_examples?: string[];
    side_effect_level: string;
    confirmation_required: boolean;
    dry_run_supported: boolean;
    dispatch_enabled: boolean;
    version: number;
    deprecated: boolean;
    input_schema: Record<string, unknown>;
    legacy_tool_name: string;
    handler_domain: "local" | "api" | "live_cdp" | "live_ipc";
}

export interface ActionRegistry {
    version: number;
    repo: string;
    field_weights: Record<string, number>;
    categories: Record<string, number>;
    actions: ActionRecord[];
}
