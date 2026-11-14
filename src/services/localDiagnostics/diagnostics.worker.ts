import { DiagnosticsCore, type CoreOperation } from './engine';

const core = new DiagnosticsCore();
const scope = self as unknown as {
    onmessage: ((event: MessageEvent<{ id: number; op: CoreOperation; args: unknown[] }>) => void) | null;
    postMessage: (message: unknown) => void;
};

scope.onmessage = async ({ data: { id, op, args } }) => {
    try {
        const method = core[op] as (...values: unknown[]) => unknown;
        scope.postMessage({ id, result: await method.apply(core, args) });
    } catch (error) {
        scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
