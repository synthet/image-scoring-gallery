/** Decode RLE mask off the main thread (small payloads only). */

export type MaskWorkerRequest = {
    width: number;
    height: number;
    counts: number[];
};

export type MaskWorkerResponse = {
    width: number;
    height: number;
    /** Row-major alpha 0–255 for subject pixels */
    alpha: Uint8ClampedArray;
};

export function decodeMaskRleInWorker(req: MaskWorkerRequest): MaskWorkerResponse {
    const { width, height, counts } = req;
    const total = width * height;
    const alpha = new Uint8ClampedArray(total);
    let idx = 0;
    let val = false;
    for (const c of counts) {
        const end = Math.min(idx + c, total);
        if (val) {
            for (let i = idx; i < end; i++) alpha[i] = 90;
        }
        idx = end;
        val = !val;
        if (idx >= total) break;
    }
    return { width, height, alpha };
}
