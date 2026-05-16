import { describe, it, expect } from 'vitest';
import { apiBaseUrlForExternalOpen } from './apiBaseUrlForBrowser';

describe('apiBaseUrlForExternalOpen', () => {
    it('uses url when browserUrl is absent', () => {
        expect(apiBaseUrlForExternalOpen({ url: 'http://127.0.0.1:7860/' })).toBe('http://127.0.0.1:7860');
    });

    it('prefers browserUrl when set', () => {
        expect(
            apiBaseUrlForExternalOpen({
                url: 'http://image-scoring-webui:7860',
                browserUrl: 'http://127.0.0.1:7860/',
            }),
        ).toBe('http://127.0.0.1:7860');
    });
});
