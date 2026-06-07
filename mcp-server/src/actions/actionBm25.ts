/** BM25 search over gallery action registry entries. */

import { tokenize } from "../router/bm25.js";

export interface ActionSearchEntry {
    action_id: string;
    title: string;
    description: string;
    tags: string[];
    aliases: string[];
    intent_examples: string[];
    argument_names: string;
    category: string;
}

function fieldText(entry: ActionSearchEntry, field: string): string {
    if (field === "action_id") return entry.action_id;
    if (field === "title") return entry.title;
    if (field === "tags") return entry.tags.join(" ");
    if (field === "aliases") return entry.aliases.join(" ");
    if (field === "intent_examples") return entry.intent_examples.join(" ");
    if (field === "argument_names") return entry.argument_names;
    return entry.description;
}

export class ActionBm25Index {
    private readonly entries: ActionSearchEntry[];
    private readonly fieldWeights: Record<string, number>;
    private readonly k1: number;
    private readonly b: number;
    private readonly docFields: Array<Record<string, string[]>> = [];
    private readonly docLengths: number[] = [];
    private readonly df = new Map<string, number>();
    private readonly N: number;
    private avgdl = 0;

    constructor(entries: ActionSearchEntry[], fieldWeights: Record<string, number>, k1 = 1.2, b = 0.75) {
        this.entries = entries;
        this.fieldWeights = fieldWeights;
        this.k1 = k1;
        this.b = b;
        this.N = entries.length;
        this.build();
    }

    private build(): void {
        for (const entry of this.entries) {
            const fields: Record<string, string[]> = {};
            let totalLen = 0;
            for (const [field, weight] of Object.entries(this.fieldWeights)) {
                if (weight <= 0) continue;
                const tokens = tokenize(fieldText(entry, field));
                fields[field] = tokens;
                totalLen += tokens.length * weight;
                const seen = new Set(tokens);
                for (const tok of seen) {
                    this.df.set(tok, (this.df.get(tok) ?? 0) + 1);
                }
            }
            this.docFields.push(fields);
            this.docLengths.push(totalLen);
        }
        if (this.N > 0) {
            this.avgdl = this.docLengths.reduce((a, c) => a + c, 0) / this.N;
        }
    }

    private idf(term: string): number {
        const df = this.df.get(term) ?? 0;
        return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
    }

    private scoreDoc(qTerms: string[], docIdx: number): number {
        const fields = this.docFields[docIdx];
        const dl = this.docLengths[docIdx];
        let score = 0;
        for (const [field, weight] of Object.entries(this.fieldWeights)) {
            if (weight <= 0) continue;
            const docTokens = fields[field] ?? [];
            if (!docTokens.length) continue;
            const tfMap = new Map<string, number>();
            for (const t of docTokens) tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
            const fieldLen = docTokens.length * weight;
            const norm = 1 - this.b + this.b * (fieldLen / (this.avgdl || 1));
            for (const term of qTerms) {
                const tf = tfMap.get(term) ?? 0;
                if (tf <= 0) continue;
                const num = tf * (this.k1 + 1);
                const den = tf + this.k1 * norm;
                score += weight * this.idf(term) * (num / den);
            }
        }
        return score;
    }

    search(
        query: string,
        opts: { limit?: number; category?: string; readOnlyOnly?: boolean } = {},
    ): Array<{ entry: ActionSearchEntry; score: number; idx: number }> {
        const qTerms = tokenize(query);
        if (!qTerms.length) return [];
        const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
        const scored: Array<{ idx: number; score: number }> = [];
        for (let idx = 0; idx < this.entries.length; idx++) {
            const entry = this.entries[idx];
            if (opts.category && entry.category !== opts.category) continue;
            const s = this.scoreDoc(qTerms, idx);
            if (s > 0) scored.push({ idx, score: s });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit).map(({ idx, score }) => ({
            entry: this.entries[idx],
            score,
            idx,
        }));
    }
}
