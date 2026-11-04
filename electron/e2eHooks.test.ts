import { describe, expect, it } from 'vitest';
import { e2eWindowOptions, readE2eOverrides, resolveConfigPath } from './e2eHooks';

describe('e2eWindowOptions', () => {
    const options = { width: 800, webPreferences: { contextIsolation: true } };

    it('leaves a normal launch alone', () => {
        expect(e2eWindowOptions(options, {})).toEqual(options);
        expect(e2eWindowOptions(options, { GALLERY_E2E_HEADED: '1' })).toEqual(options);
    });

    it('hides windows during an e2e run, keeps their options, and stops throttling them', () => {
        expect(e2eWindowOptions(options, { GALLERY_E2E: '1' })).toEqual({
            width: 800, show: false, webPreferences: { contextIsolation: true, offscreen: true, backgroundThrottling: false },
        });
    });

    it('shows windows when a debugging run asks for them', () => {
        expect(e2eWindowOptions(options, { GALLERY_E2E: '1', GALLERY_E2E_HEADED: '1' })).toEqual(options);
    });
});

describe('readE2eOverrides', () => {
    it('is inert without GALLERY_E2E=1', () => {
        expect(readE2eOverrides({})).toBeNull();
        expect(readE2eOverrides({ GALLERY_E2E: 'true', GALLERY_USER_DATA: '/tmp/u' })).toBeNull();
        expect(readE2eOverrides({ GALLERY_USER_DATA: '/tmp/u', GALLERY_CONFIG: '/tmp/c.json' })).toBeNull();
    });

    it('returns the test paths when enabled', () => {
        expect(readE2eOverrides({ GALLERY_E2E: '1', GALLERY_USER_DATA: ' /tmp/u ', GALLERY_CONFIG: '/tmp/c.json' }))
            .toEqual({ userData: '/tmp/u', configPath: '/tmp/c.json' });
        expect(readE2eOverrides({ GALLERY_E2E: '1' })).toEqual({ userData: null, configPath: null });
    });

    it('routes config reads and writes to the test config only when enabled', () => {
        expect(resolveConfigPath('/app/config.json', {})).toBe('/app/config.json');
        expect(resolveConfigPath('/app/config.json', { GALLERY_CONFIG: '/tmp/c.json' })).toBe('/app/config.json');
        expect(resolveConfigPath('/app/config.json', { GALLERY_E2E: '1', GALLERY_CONFIG: '/tmp/c.json' })).toBe('/tmp/c.json');
        expect(resolveConfigPath('/app/config.json', { GALLERY_E2E: '1' })).toBe('/app/config.json');
    });
});
