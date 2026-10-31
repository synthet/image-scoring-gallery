import { useEffect, useState } from 'react';
import { bridge } from '../bridge';

/** Follows View > Focus Point from the main-process menu. */
export function useShowFocusPoint(): boolean {
    const [show, setShow] = useState(false);
    useEffect(() => {
        let active = true;
        if (typeof bridge.getShowFocusPoint === 'function') {
            void bridge.getShowFocusPoint().then((value) => {
                if (active) setShow(value);
            });
        }
        const unsubscribe = typeof bridge.onShowFocusPointChanged === 'function'
            ? bridge.onShowFocusPointChanged((value) => setShow(value))
            : () => {};
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);
    return show;
}
