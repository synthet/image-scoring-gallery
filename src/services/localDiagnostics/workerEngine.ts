import DiagnosticsWorker from './diagnostics.worker?worker&inline';
import { DiagnosticsCore, type CoreOperation } from './engine';
import type { LocalEngine } from './transport';

/** Long edge of the analysis image; larger previews are reduced (and labelled so) to bound memory and time. */
export const MAX_ANALYSIS_EDGE = 4096;

async function decode(src: string) {
    // Same path as the export bake: fetched bytes decode to untainted, display-oriented pixels.
    const blob = await (await fetch(src)).blob();
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return { bitmap, naturalWidth: bitmap.width, naturalHeight: bitmap.height };
    const reduced = await createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * scale),
        resizeHeight: Math.round(bitmap.height * scale), resizeQuality: 'high' });
    const size = { naturalWidth: bitmap.width, naturalHeight: bitmap.height };
    bitmap.close();
    return { bitmap: reduced, ...size };
}

/** Runs the pixel work in an inline (blob) worker, so it also works from `file://`; in-thread without workers. */
export function createWorkerEngine(): LocalEngine {
    let worker: Worker | null = null;
    let core: DiagnosticsCore | null = null;
    let sequence = 0;
    let disposed = false;
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

    function call<T>(op: CoreOperation, args: unknown[] = [], transfer: Transferable[] = []): Promise<T> {
        // Disposal is final: never start a worker that nothing would terminate.
        if (disposed) return Promise.reject(new Error('Diagnostics were closed'));
        if (!worker && !core) {
            if (typeof Worker === 'undefined') core = new DiagnosticsCore();
            else {
                worker = new DiagnosticsWorker();
                worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
                    const entry = pending.get(data.id);
                    pending.delete(data.id);
                    if (data.error != null) entry?.reject(new Error(data.error));
                    else entry?.resolve(data.result);
                };
                worker.onerror = event => {
                    for (const entry of pending.values()) entry.reject(new Error(event.message || 'Diagnostics worker failed'));
                    pending.clear();
                };
            }
        }
        if (core) {
            const method = core[op] as (...values: unknown[]) => unknown;
            return Promise.resolve().then(() => method.apply(core, args) as T);
        }
        const id = ++sequence;
        return new Promise<T>((resolve, reject) => {
            pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
            worker!.postMessage({ id, op, args }, transfer);
        });
    }

    return {
        async load(src) {
            const { bitmap, naturalWidth, naturalHeight } = await decode(src);
            if (disposed) {
                bitmap.close();
                throw new Error('Diagnostics were closed');
            }
            const size = await call<{ width: number; height: number }>('load', [bitmap], [bitmap]);
            return { ...size, naturalWidth, naturalHeight };
        },
        maps: () => call('maps'),
        peaking: () => call('peaking'),
        peakingImage: mode => call('peakingImage', [mode]),
        head: (points, region) => call('head', [points, region]),
        dispose() {
            disposed = true;
            worker?.terminate();
            for (const entry of pending.values()) entry.reject(new Error('Diagnostics were closed'));
            pending.clear();
            worker = null; core = null;
        },
    };
}
