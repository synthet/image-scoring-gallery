/** Cap concurrent RAW preview extractions (exiftool IPC) when many grid cells mount at once. */
const MAX_CONCURRENT = 4;
let active = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
    if (active < MAX_CONCURRENT) {
        active++;
        return;
    }
    await new Promise<void>((resolve) => {
        queue.push(() => {
            active++;
            resolve();
        });
    });
}

function release(): void {
    active--;
    const next = queue.shift();
    if (next) next();
}

export async function withRawPreviewSlot<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
        return await fn();
    } finally {
        release();
    }
}
