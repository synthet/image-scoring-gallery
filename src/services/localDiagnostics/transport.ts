import type { HeadGeometry, HeadGeometryResult } from '../../../electron/types';
import { DIAGNOSTIC_LAYERS, type DiagnosticLayer, type DiagnosticManifest, type DiagnosticTransport } from '../../types/diagnostics';
import { EXTRACTOR_VERSION, type HeadPoint, type LocalGrid, type Region } from './compute';
import type { PeakingField } from './engine';

/** Pixel operations on the viewer's decoded image (see workerEngine.ts). */
export interface LocalEngine {
    /** Decodes `src` display-oriented, reduced to the analysis size when large. */
    load(src: string): Promise<{ width: number; height: number; naturalWidth: number; naturalHeight: number }>;
    maps(): Promise<{ sharpness: LocalGrid; noise: LocalGrid }>;
    peaking(): Promise<{ marks: number }>;
    peakingImage(mode: PeakingField): Promise<Blob>;
    head(points: HeadPoint[], region: Region): Promise<{ state: 'unavailable'; reason: string } | { state: 'ready'; measurements: NonNullable<Layer['measurements']> }>;
    dispose(): void;
}

type Layer = DiagnosticManifest['layers'][DiagnosticLayer];
export const LOCAL_PREVIEW_ARTIFACT = 'local-preview';
const LIMITATION = 'Gallery preview pixels; a local estimate, not RAW sensor measurements';
export const MASK_NEEDS_BACKEND = 'Subject mask needs the backend (Tools › Connect to Backend)';

export interface LocalDiagnosticsTransport extends DiagnosticTransport {
    dispose(): void;
}

/**
 * Diagnostics computed in the gallery from the image the viewer shows, used while the backend
 * is unavailable. Sharpness, noise and peaking need only pixels; eyes/head detail needs the subject
 * selection and keypoints from the database; the subject mask stays backend-only.
 */
export function createLocalDiagnosticsTransport(src: string, engine: LocalEngine,
    loadGeometry: (imageId: number) => Promise<HeadGeometryResult>): LocalDiagnosticsTransport {
    const urls = new Set<string>();
    let disposed = false;
    const open = () => { if (disposed) throw new Error('Diagnostics were closed'); };
    let imageId = 0;
    let layers: Record<DiagnosticLayer, Layer>;
    let rendition: DiagnosticManifest['rendition'] = null;
    let natural = { width: 0, height: 0 };
    let loading: Promise<void> | null = null;
    let geometry: Promise<HeadGeometry | string> | null = null;
    let maps: ReturnType<LocalEngine['maps']> | null = null;
    const jobs = new Map<DiagnosticLayer, Promise<void>>();
    const artifacts = new Map<string, Promise<string>>();

    const reset = (id: number) => {
        imageId = id;
        layers = Object.fromEntries(DIAGNOSTIC_LAYERS.map(layer => [layer, { state: 'not_requested' }])) as typeof layers;
        layers.mask = { state: 'unavailable', reason: MASK_NEEDS_BACKEND };
        rendition = null; loading = null; geometry = null; maps = null;
        jobs.clear();
    };
    reset(0);
    const select = (id: number) => { if (id !== imageId) reset(id); };
    const snapshot = (): DiagnosticManifest => ({
        evidence_schema_version: 2, image_id: imageId, identity: `local:${imageId}:${src}`, extractor_version: EXTRACTOR_VERSION,
        rendition, layers: { ...layers },
    });

    const load = () => loading ??= engine.load(src).then(size => {
        natural = { width: size.naturalWidth, height: size.naturalHeight };
        rendition = { rendition_hash: 'local', display_width: size.width, display_height: size.height, preview_artifact: LOCAL_PREVIEW_ARTIFACT,
            source_resolution: size.width < size.naturalWidth ? 'reduced' : 'decoded_native', coord_space: 'display_normalized',
            decode_route: 'gallery_preview', pixel_policy: 'local_estimate' };
    }).catch(failure => { loading = null; throw failure; });

    /** The selected subject geometry, or why it cannot be used for this image. */
    const subject = (id: number) => geometry ??= loadGeometry(id).then(result => {
        if (!result.geometry) return result.reason;
        // Accept rounding from a resized rendition, never an incompatible crop/aspect ratio.
        const expected = result.geometry.display_width / result.geometry.display_height;
        const tolerance = 2 / Math.min(result.geometry.display_height, natural.height);
        return Math.abs(expected - natural.width / natural.height) <= tolerance
            ? result.geometry : 'Subject coordinates do not match the decoded rendition; regenerate localization';
    }, () => 'The database is unavailable');

    async function compute(id: number, layer: DiagnosticLayer): Promise<Layer> {
        await load();
        open();
        if (layer === 'mask') return { state: 'unavailable', reason: MASK_NEEDS_BACKEND };
        if (layer === 'sharpness' || layer === 'noise') {
            const grid = (await (maps ??= engine.maps().catch(failure => { maps = null; throw failure; })))[layer];
            const values = grid.values.filter((value): value is number => value != null);
            if (!values.length) return { state: 'unavailable', reason: 'Insufficient low-structure pixels for a reliable estimate' };
            const measurements: NonNullable<Layer['measurements']> = { mean: values.reduce((a, b) => a + b, 0) / values.length, units: grid.units, limitations: [LIMITATION] };
            const region = layer === 'sharpness' ? await subject(id) : null;
            if (region && typeof region !== 'string') {
                const [x0, y0, x1, y1] = region.region;
                const inside: number[] = [], outside: number[] = [];
                for (let cy = 0; cy < grid.cells_y; cy++) for (let cx = 0; cx < grid.cells_x; cx++) {
                    const value = grid.values[cy * grid.cells_x + cx];
                    if (value == null) continue;
                    const mx = (grid.x_edges[cx] + grid.x_edges[cx + 1]) / (2 * rendition!.display_width);
                    const my = (grid.y_edges[cy] + grid.y_edges[cy + 1]) / (2 * rendition!.display_height);
                    (x0 <= mx && mx <= x1 && y0 <= my && my <= y1 ? inside : outside).push(value);
                }
                const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
                if (inside.length && outside.length && mean(outside) > 1e-6) measurements.region_background_ratio = mean(inside) / mean(outside);
            }
            return { state: 'ready', grid, measurements, provider_version: EXTRACTOR_VERSION };
        }
        if (layer === 'peaking') {
            const { marks } = await engine.peaking();
            return { state: 'ready', provider_version: EXTRACTOR_VERSION, measurements: { marks, limitations: [LIMITATION] },
                artifacts: { outlines: 'local-peaking-outlines', texture: 'local-peaking-texture', both: 'local-peaking-both' } };
        }
        const found = await subject(id);
        if (typeof found === 'string') return { state: 'unavailable', reason: found };
        const result = await engine.head(found.keypoints, found.region);
        return result.state === 'ready' ? { state: 'ready', measurements: result.measurements, provider_version: EXTRACTOR_VERSION } : result;
    }

    function run(id: number, layer: DiagnosticLayer): Promise<void> {
        let job = jobs.get(layer);
        if (!job) {
            layers[layer] = { state: 'running' };
            job = compute(id, layer).then(entry => entry, (failure: unknown) => {
                if (!disposed) console.warn(`[diagnostics] local ${layer} failed`, failure);
                return { state: 'failed', reason: 'Local diagnostic computation failed; use Refresh to retry' } as Layer;
            }).then(entry => {
                if (imageId !== id) return;
                layers[layer] = entry;
                if (entry.state !== 'ready') jobs.delete(layer);
            });
            jobs.set(layer, job);
        }
        return job;
    }

    return {
        manifest: async id => { select(id); return snapshot(); },
        request: async (id, requested, refresh = false) => {
            open();
            select(id);
            if (refresh) {
                for (const layer of requested) jobs.delete(layer);
                maps = null; geometry = null;
            }
            await Promise.all(requested.map(layer => run(id, layer)));
            return snapshot();
        },
        cancel: async () => undefined,
        artifact: (id, artifactId) => {
            if (disposed) return Promise.reject(new Error('Diagnostics were closed'));
            if (artifactId === LOCAL_PREVIEW_ARTIFACT) return Promise.resolve(src);
            const mode = artifactId.replace('local-peaking-', '') as PeakingField;
            if (id !== imageId || !['outlines', 'texture', 'both'].includes(mode)) return Promise.reject(new Error('Unknown diagnostic artifact'));
            let url = artifacts.get(mode);
            if (!url) {
                url = engine.peakingImage(mode).then(blob => { const value = URL.createObjectURL(blob); urls.add(value); return value; });
                artifacts.set(mode, url);
                void url.catch(() => artifacts.delete(mode));
            }
            return url;
        },
        /** Final: later requests reject and the engine is never used again. */
        dispose: () => {
            disposed = true;
            engine.dispose();
            for (const url of urls) URL.revokeObjectURL(url);
            urls.clear();
            artifacts.clear();
        },
    };
}
