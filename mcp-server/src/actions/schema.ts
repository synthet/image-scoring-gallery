import type { ActionRecord } from "./types.js";

export function schemaArgLists(schema: Record<string, unknown>): {
    required: string[];
    optional: string[];
} {
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    const required = (schema.required ?? []) as string[];
    const optional = Object.keys(props).filter((k) => !required.includes(k));
    return { required, optional };
}

export function validateArguments(
    schema: Record<string, unknown> | undefined,
    args: Record<string, unknown>,
): Record<string, unknown> {
    const sch = schema ?? { type: "object", additionalProperties: false };
    const props = (sch.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = (sch.required ?? []) as string[];
    const additional = sch.additionalProperties !== false;

    const out: Record<string, unknown> = {};
    for (const key of required) {
        if (!(key in args) || args[key] === undefined || args[key] === null) {
            throw new Error(`Missing required argument: ${key}`);
        }
    }
    for (const [key, value] of Object.entries(args)) {
        if (!(key in props)) {
            if (!additional) {
                throw new Error(`Unknown argument: ${key}`);
            }
            out[key] = value;
            continue;
        }
        out[key] = value;
    }
    for (const key of required) {
        out[key] = args[key];
    }
    return out;
}

export function actionToSearchEntry(action: ActionRecord) {
    const { required, optional } = schemaArgLists(action.input_schema);
    return {
        action_id: action.action_id,
        title: action.title,
        description: action.description,
        tags: action.tags,
        aliases: action.aliases ?? [],
        intent_examples: action.intent_examples ?? [],
        argument_names: [...required, ...optional].join(" "),
        category: action.category,
    };
}
