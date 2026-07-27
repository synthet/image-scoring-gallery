import { useEffect, useRef } from 'react';

/**
 * Returns a ref whose `current` is updated in an effect (not during render).
 * Use for stable callbacks read from async handlers / WebSocket listeners.
 */
export function useSyncRef<T>(value: T) {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
}
