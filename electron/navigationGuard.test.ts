import { describe, expect, it } from 'vitest';
import { isAllowedAppNavigation, isAllowedExternalUrl } from './navigationGuard';

describe('isAllowedExternalUrl (#224)', () => {
    const backend = ['http://127.0.0.1:7860', 'http://photos.lan:8080/'];

    it('allows http(s) URLs on a configured backend origin', () => {
        expect(isAllowedExternalUrl('http://127.0.0.1:7860/ui/images/42', backend)).toBe(true);
        expect(isAllowedExternalUrl('http://photos.lan:8080/ui/runs', backend)).toBe(true);
    });

    it('refuses other origins, ports and schemes', () => {
        expect(isAllowedExternalUrl('http://127.0.0.1:9/evil', backend)).toBe(false);
        expect(isAllowedExternalUrl('https://127.0.0.1:7860/ui', backend)).toBe(false);
        expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe', backend)).toBe(false);
        expect(isAllowedExternalUrl('javascript:alert(1)', backend)).toBe(false);
        expect(isAllowedExternalUrl('not a url', backend)).toBe(false);
    });

    it('refuses everything when no backend is configured', () => {
        expect(isAllowedExternalUrl('http://127.0.0.1:7860/ui', [])).toBe(false);
    });
});

describe('isAllowedAppNavigation (#224)', () => {
    const prod = 'file:///C:/app/dist/index.html';
    const dev = 'http://localhost:5173/';

    it('allows reloading the app page itself, with or without a hash or query', () => {
        expect(isAllowedAppNavigation('file:///C:/app/dist/index.html', prod)).toBe(true);
        expect(isAllowedAppNavigation('file:///C:/app/dist/index.html#/folder/3', prod)).toBe(true);
        expect(isAllowedAppNavigation('http://localhost:5173/some/route?x=1', dev)).toBe(true);
    });

    it('refuses remote origins and other local files', () => {
        expect(isAllowedAppNavigation('http://127.0.0.1:7860/evil', prod)).toBe(false);
        expect(isAllowedAppNavigation('file:///C:/Users/me/secret.html', prod)).toBe(false);
        expect(isAllowedAppNavigation('http://evil.example/', dev)).toBe(false);
        expect(isAllowedAppNavigation('garbage', prod)).toBe(false);
    });
});
