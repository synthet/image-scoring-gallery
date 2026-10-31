import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./apiUrlResolver', () => ({ resolveBaseUrl: () => 'http://127.0.0.1:7860' }));
import { ApiService } from './apiService';
import type { AppConfig } from './types';

describe('diagnostic artifact transport', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('preserves binary images across the IPC boundary', async () => {
        const fetch = vi.fn(async (_url: string) => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }));
        vi.stubGlobal('fetch', fetch);
        const api = new ApiService(() => ({} as AppConfig));
        const artifact = `${'a'.repeat(64)}_${'b'.repeat(64)}.png`;
        expect(await api.getDiagnosticArtifact(1, artifact)).toBe('data:image/png;base64,iVBORw==');
        expect(fetch.mock.calls[0][0]).toContain(`/api/images/1/evidence/artifacts/${artifact}`);
    });
    it('rejects path injection and handles empty cancellation responses', async () => {
        const fetch = vi.fn(async () => new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetch);
        const api = new ApiService(() => ({} as AppConfig));
        await expect(api.getDiagnosticArtifact(1, '../../config.json')).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
        await expect(api.cancelDiagnostics(1, 'a'.repeat(32))).resolves.toBeUndefined();
    });
});
