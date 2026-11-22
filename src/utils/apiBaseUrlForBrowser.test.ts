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

describe('apiBaseUrlForExternalOpen in the web version (#288)', () => {
    const docker = { url: 'http://image-scoring-webui:7860', browserUrl: 'http://127.0.0.1:7860' };

    it('swaps a loopback backend host for the hostname the page was opened by', () => {
        expect(apiBaseUrlForExternalOpen(docker, 'gallery-pc')).toBe('http://gallery-pc:7860');
        expect(apiBaseUrlForExternalOpen({ url: 'http://localhost:7860/' }, '192.168.1.20')).toBe('http://192.168.1.20:7860');
    });

    it('keeps the URL when the page itself is on loopback', () => {
        expect(apiBaseUrlForExternalOpen(docker, 'localhost')).toBe('http://127.0.0.1:7860');
        expect(apiBaseUrlForExternalOpen(docker, '127.0.0.1')).toBe('http://127.0.0.1:7860');
    });

    it('keeps a non-loopback backend host', () => {
        expect(apiBaseUrlForExternalOpen({ url: 'http://nas.lan:7860' }, 'gallery-pc')).toBe('http://nas.lan:7860');
    });

    it('brackets an IPv6 page host', () => {
        expect(apiBaseUrlForExternalOpen(docker, 'fe80::1')).toBe('http://[fe80::1]:7860');
        // location.hostname keeps the brackets for an IPv6 literal
        expect(apiBaseUrlForExternalOpen(docker, '[fe80::1]')).toBe('http://[fe80::1]:7860');
        expect(apiBaseUrlForExternalOpen(docker, '[::1]')).toBe('http://127.0.0.1:7860');
    });

    it('is unchanged without a page host (desktop app)', () => {
        expect(apiBaseUrlForExternalOpen(docker, undefined)).toBe('http://127.0.0.1:7860');
    });
});
