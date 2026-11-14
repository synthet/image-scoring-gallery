import { describe, expect, it, vi } from 'vitest';
import type { HeadGeometryResult } from '../../../electron/types';
import { computeMaps, measureHead, type Grey } from './compute';
import { createLocalDiagnosticsTransport, LOCAL_PREVIEW_ARTIFACT, MASK_NEEDS_BACKEND, type LocalEngine } from './transport';

// A 128x96 checkerboard: high-contrast left half, low-contrast right half.
const W = 128, H = 96;
const grey: Grey = { width: W, height: H, data: new Float32Array(W * H) };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grey.data[y * W + x] = x < 64 ? ((x >> 3) + (y >> 3)) % 2 ? .8 : .2 : ((x >> 3) + (y >> 3)) % 2 ? .55 : .45;

function engine(): LocalEngine {
    return {
        load: vi.fn(async () => ({ width: W, height: H, naturalWidth: W * 2, naturalHeight: H * 2 })),
        maps: vi.fn(async () => computeMaps(grey)),
        peaking: vi.fn(async () => ({ marks: 42 })),
        peakingImage: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
        head: vi.fn(async (points, region) => measureHead(grey, points, region)),
        dispose: vi.fn(),
    };
}
const geometry = (result: Partial<HeadGeometryResult> = {}): HeadGeometryResult => ({
    geometry: { region: [0, 0, .5, 1], display_width: 400, display_height: 300, keypoints: [
        { name: 'left_eye', x: .2, y: .3, confidence: .9, visible: true },
        { name: 'beak', x: .3, y: .4, confidence: .9, visible: true },
    ] }, ...result } as HeadGeometryResult);

describe('local diagnostics transport', () => {
    it('reports the mask as backend-only and other layers as not requested', async () => {
        const transport = createLocalDiagnosticsTransport('blob:preview', engine(), async () => geometry());
        const manifest = await transport.manifest(7);
        expect(manifest.image_id).toBe(7);
        expect(manifest.rendition).toBeNull();
        expect(manifest.layers.mask).toEqual({ state: 'unavailable', reason: MASK_NEEDS_BACKEND });
        expect(manifest.layers.sharpness.state).toBe('not_requested');
    });

    it('computes sharpness, noise and peaking from the viewer preview', async () => {
        const local = engine();
        const transport = createLocalDiagnosticsTransport('blob:preview', local, async () => ({ geometry: null, reason: 'No authoritative bird selection' }));
        const manifest = await transport.request(7, ['sharpness', 'noise', 'peaking']);
        expect(local.load).toHaveBeenCalledTimes(1);
        expect(local.maps).toHaveBeenCalledTimes(1);
        expect(manifest.rendition).toMatchObject({ display_width: W, display_height: H, source_resolution: 'reduced', preview_artifact: LOCAL_PREVIEW_ARTIFACT });
        expect(manifest.layers.sharpness.state).toBe('ready');
        expect(manifest.layers.sharpness.grid?.cells_x).toBe(2);
        expect(manifest.layers.sharpness.measurements?.region_background_ratio).toBeUndefined();
        expect(manifest.layers.noise.state).toBe('ready');
        expect(manifest.layers.peaking).toMatchObject({ state: 'ready', measurements: { marks: 42 } });
        await expect(transport.artifact(7, LOCAL_PREVIEW_ARTIFACT)).resolves.toBe('blob:preview');
        const url = await transport.artifact(7, manifest.layers.peaking.artifacts!.both);
        expect(url).toMatch(/^blob:/);
        expect(local.peakingImage).toHaveBeenCalledWith('both');
        transport.dispose();
        expect(local.dispose).toHaveBeenCalled();
    });

    it('measures eyes/head detail from database geometry with a matching aspect ratio', async () => {
        const local = engine();
        const transport = createLocalDiagnosticsTransport('blob:preview', local, async () => geometry());
        const manifest = await transport.request(7, ['head', 'sharpness']);
        expect(manifest.layers.head.state).toBe('ready');
        expect(manifest.layers.head.measurements?.eyes?.[0].name).toBe('left_eye');
        expect(manifest.layers.sharpness.measurements?.region_background_ratio).toBeGreaterThan(1);
    });

    it('explains why eyes/head detail is unavailable', async () => {
        const reasons = await Promise.all([
            async () => ({ geometry: null, reason: 'No authoritative bird selection' }) as HeadGeometryResult,
            async () => geometry({ geometry: { region: [0, 0, 1, 1], display_width: 300, display_height: 300, keypoints: [] } }),
            async () => { throw new Error('connection refused'); },
        ].map(async load => (await createLocalDiagnosticsTransport('blob:preview', engine(), load).request(7, ['head'])).layers.head));
        expect(reasons).toEqual([
            { state: 'unavailable', reason: 'No authoritative bird selection' },
            { state: 'unavailable', reason: 'Subject coordinates do not match the decoded rendition; regenerate localization' },
            { state: 'unavailable', reason: 'The database is unavailable' },
        ]);
    });

    it('never uses the engine after dispose, even when a decode finishes late', async () => {
        const local = engine();
        let finishLoad!: () => void;
        vi.mocked(local.load).mockImplementation(() => new Promise(resolve => { finishLoad = () => resolve({ width: W, height: H, naturalWidth: W, naturalHeight: H }); }));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const transport = createLocalDiagnosticsTransport('blob:preview', local, async () => geometry());
        const pending = transport.request(7, ['sharpness', 'peaking', 'head']);
        transport.dispose();
        finishLoad();
        await pending;
        expect(local.maps).not.toHaveBeenCalled();
        expect(local.peaking).not.toHaveBeenCalled();
        expect(local.head).not.toHaveBeenCalled();
        await expect(transport.request(7, ['noise'])).rejects.toThrow('Diagnostics were closed');
        await expect(transport.artifact(7, LOCAL_PREVIEW_ARTIFACT)).rejects.toThrow('Diagnostics were closed');
    });

    it('marks a failed computation for retry', async () => {
        const local = engine();
        vi.mocked(local.maps).mockRejectedValueOnce(new Error('out of memory'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const transport = createLocalDiagnosticsTransport('blob:preview', local, async () => geometry());
        expect((await transport.request(7, ['noise'])).layers.noise.state).toBe('failed');
        expect((await transport.request(7, ['noise'], true)).layers.noise.state).toBe('ready');
    });
});
