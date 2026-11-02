import { describe, expect, it } from 'vitest';
import { readE2eOverrides, resolveConfigPath } from './e2eHooks';

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
