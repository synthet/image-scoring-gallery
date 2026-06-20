import { describe, expect, it } from 'vitest';
import {
    buildModelInfosFromApi,
    buildModelInfosFromConfig,
    buildSortOptions,
    mergeProductionModelInfos,
} from './scoringModels';

describe('scoringModels', () => {
    it('includes production models only from API response (excludes shadow)', () => {
        const infos = buildModelInfosFromApi([
            { name: 'topiq', enabled: true, shadow: false },
            { name: 'cursor', enabled: false, shadow: true },
            { name: 'claude', enabled: false, shadow: true },
            { name: 'claude', enabled: false, shadow: false },
        ]);

        expect(infos.map((m) => m.name)).toEqual(['topiq']);
        expect(infos[0]).toMatchObject({
            sortKey: 'model:topiq',
            source: 'model_scores',
            label: 'TOPIQ-NR',
            isShadow: false,
        });
    });

    it('routes legacy models through the image_model_scores sort path', () => {
        const infos = buildModelInfosFromApi([
            { name: 'spaq', enabled: true, shadow: false },
            { name: 'liqe', enabled: true, shadow: false },
        ]);

        expect(infos).toEqual([
            expect.objectContaining({ name: 'liqe', sortKey: 'model:liqe', source: 'model_scores' }),
            expect.objectContaining({ name: 'spaq', sortKey: 'model:spaq', source: 'model_scores' }),
        ]);
    });

    it('respects disabled and shadow models from config fallback', () => {
        const infos = buildModelInfosFromConfig({
            topiq: { enabled: true, shadow: false },
            cursor: { enabled: false, shadow: true },
            claude: { enabled: false, shadow: true },
        });

        const names = infos.map((m) => m.name);
        expect(names).toContain('topiq');
        expect(names).toContain('spaq');
        expect(names).not.toContain('cursor');
        expect(names).not.toContain('claude');
    });

    it('merges config defaults when API returns only a subset of production models', () => {
        const fromConfig = buildModelInfosFromConfig({
            topiq: { enabled: true, shadow: false },
            cursor: { enabled: false, shadow: false },
        });
        const fromApi = buildModelInfosFromApi([
            { name: 'topiq', enabled: true, shadow: false },
        ]);

        const merged = mergeProductionModelInfos(fromConfig, fromApi);
        const names = merged.map((m) => m.name);

        expect(names).toContain('spaq');
        expect(names).toContain('ava');
        expect(names).toContain('liqe');
        expect(names).toContain('topiq');
        expect(names).not.toContain('cursor');
    });

    it('prepends composite/meta options before model options', () => {
        const options = buildSortOptions(
            buildModelInfosFromApi([{ name: 'topiq', enabled: true, shadow: false }]),
        );

        expect(options.slice(0, 5).map((o) => o.value)).toEqual([
            'score_general',
            'score_technical',
            'score_aesthetic',
            'capture_date',
            'id',
        ]);
        expect(options.at(-2)).toEqual({
            value: 'model:topiq',
            label: 'TOPIQ-NR',
            group: 'model',
        });
        expect(options.at(-1)).toEqual({
            value: 'model:clip_quality_v0',
            label: 'CLIP Quality',
            group: 'model',
        });
    });

    it('never includes excluded models such as qpt_v2', () => {
        const infos = buildModelInfosFromApi([
            { name: 'topiq', enabled: true, shadow: false },
            { name: 'qpt_v2', enabled: true, shadow: false },
            { name: 'koniq', enabled: true, shadow: false },
            { name: 'paq2piq', enabled: true, shadow: false },
        ]);
        expect(infos.map((m) => m.name)).toEqual(['topiq']);

        const fromConfig = buildModelInfosFromConfig({
            topiq: { enabled: true, shadow: false },
            qpt_v2: { enabled: true, shadow: false },
        });
        expect(fromConfig.map((m) => m.name)).not.toContain('qpt_v2');
    });

    it('FALLBACK_MODEL_SORT_OPTIONS routes legacy models through the model: sort key', async () => {
        const { FALLBACK_MODEL_SORT_OPTIONS } = await import('./scoringModels');
        const modelOptions = FALLBACK_MODEL_SORT_OPTIONS.filter((o) => o.group === 'model');
        const values = modelOptions.map((o) => o.value);
        expect(values).toEqual(['model:spaq', 'model:ava', 'model:liqe']);
    });
});
