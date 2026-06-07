import { ActionBm25Index } from "./actionBm25.js";
import { actionById, loadActionRegistry, registryActions } from "./registry.js";
import { actionToSearchEntry, schemaArgLists } from "./schema.js";

const LOW_CONFIDENCE_THRESHOLD = 0.35;
const LOW_CONFIDENCE_GAP = 0.08;

let index: ActionBm25Index | null = null;

function getIndex(): ActionBm25Index {
    if (!index) {
        const reg = loadActionRegistry();
        const weights = reg.field_weights ?? {
            action_id: 4.0,
            title: 3.0,
            aliases: 2.5,
            tags: 2.0,
            intent_examples: 2.5,
            description: 1.0,
            argument_names: 1.5,
        };
        const entries = registryActions(reg)
            .filter((a) => a.dispatch_enabled)
            .map(actionToSearchEntry);
        index = new ActionBm25Index(entries, weights);
    }
    return index;
}

function normalizeConfidence(score: number, topScore: number): number {
    if (topScore <= 0) return 0;
    return Math.min(1, Math.max(0, score / topScore));
}

export interface SearchOptions {
    limit?: number;
    category?: string;
    readOnlyOnly?: boolean;
    includeSchemas?: boolean;
}

export function searchActions(query: string, opts: SearchOptions = {}): Record<string, unknown> {
    const trimmed = query.trim();
    if (!trimmed) {
        return { query, count: 0, results: [], low_confidence: true };
    }

    const reg = loadActionRegistry();
    const hits = getIndex().search(trimmed, {
        limit: opts.limit ?? 10,
        category: opts.category,
        readOnlyOnly: opts.readOnlyOnly,
    });

    const topScore = hits[0]?.score ?? 0;
    const results = hits
        .map(({ entry, score }) => {
            const action = actionById(entry.action_id, reg);
            if (!action) return null;
            if (opts.readOnlyOnly && action.side_effect_level !== "read_only") return null;
            const { required, optional } = schemaArgLists(action.input_schema);
            const row: Record<string, unknown> = {
                action_id: action.action_id,
                title: action.title,
                description: action.description,
                category: action.category,
                side_effect_level: action.side_effect_level,
                confidence: Math.round(normalizeConfidence(score, topScore) * 10000) / 10000,
                required_args: required,
                optional_args: optional,
                confirmation_required: action.confirmation_required,
                dispatch_hint: { action_id: action.action_id, args: {} },
            };
            if (opts.includeSchemas) {
                row.input_schema = action.input_schema;
            }
            return row;
        })
        .filter((r): r is Record<string, unknown> => r !== null);

    const topConf = (results[0]?.confidence as number) ?? 0;
    const secondConf = (results[1]?.confidence as number) ?? 0;
    const lowConfidence =
        results.length === 0 ||
        topConf < LOW_CONFIDENCE_THRESHOLD ||
        topConf - secondConf < LOW_CONFIDENCE_GAP;

    return {
        query: trimmed,
        count: results.length,
        results,
        low_confidence: lowConfidence,
    };
}

/** Test helper: reset cached index after registry changes. */
export function resetSearchIndexForTests(): void {
    index = null;
}
