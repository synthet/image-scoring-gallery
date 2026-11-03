import type { IpcMain, IpcMainInvokeEvent } from 'electron';

/**
 * Records every ipcMain.handle handler at registration so the driftara live server can invoke a
 * channel by name (driftara `ipc.*` actions). Electron offers no public way to call a registered
 * handler, so main.ts passes the registrars this recording wrapper instead of the bare ipcMain.
 *
 * Only channels registered through the wrapper can be invoked. The live server additionally allows
 * only channels in the checked-in driftara catalog.
 */
type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export interface IpcInvokeRegistry {
    /** Drop-in for ipcMain: handle() records the handler, then registers it with the real ipcMain. */
    ipcMain: IpcMain;
    invoke: (channel: string, args: unknown[]) => Promise<unknown>;
    channels: () => string[];
}

/** Handlers ignore the event today; driftara calls get a marked stand-in, never a renderer's sender. */
const DRIFTARA_EVENT = Object.freeze({ driftara: true }) as unknown as IpcMainInvokeEvent;

export function createIpcInvokeRegistry(target: IpcMain): IpcInvokeRegistry {
    const handlers = new Map<string, Handler>();
    const ipcMain = new Proxy(target, {
        get(obj, prop) {
            if (prop === 'handle') {
                return (channel: string, listener: Handler) => {
                    handlers.set(channel, listener);
                    return obj.handle(channel, listener);
                };
            }
            const value = Reflect.get(obj, prop, obj);
            return typeof value === 'function' ? value.bind(obj) : value;
        },
    });

    return {
        ipcMain,
        invoke: async (channel, args) => {
            const handler = handlers.get(channel);
            if (!handler) throw new Error(`IPC channel '${channel}' is not registered`);
            return await handler(DRIFTARA_EVENT, ...args);
        },
        channels: () => [...handlers.keys()].sort(),
    };
}
