/**
 * Wraps an IPC handler to provide consistent error handling.
 * Returns { ok: true, data: T } on success, { ok: false, error: string } on error.
 */
export function wrapIpcHandler<T, TArgs extends unknown[] = unknown[]>(
    handler: (...args: TArgs) => Promise<T> | T
): (...args: TArgs) => Promise<{ ok: boolean; data?: T; error?: string }> {
    return async (...args: TArgs) => {
        try {
            const data = await handler(...args);
            return { ok: true, data };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error) || 'Unknown error';
            console.error('[IPC] Handler error:', errorMessage, error);
            return { ok: false, error: errorMessage };
        }
    };
}
