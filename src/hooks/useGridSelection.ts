import { useCallback, useState } from 'react';
import { EMPTY_SELECTION, type GridSelection } from '../utils/gridSelection';

/**
 * Selection state for one view of the grid (#239). Leaving the view, by opening another folder or changing
 * a filter, ends the selection for good: coming back must not silently restore photos picked earlier.
 */
export function useGridSelection(scope: string): [GridSelection, (selection: GridSelection) => void, () => void] {
    const [state, setState] = useState({ scope, selection: EMPTY_SELECTION });
    if (state.scope !== scope) setState({ scope, selection: EMPTY_SELECTION });
    const setSelection = useCallback((selection: GridSelection) => setState({ scope, selection }), [scope]);
    const clear = useCallback(() => setState({ scope, selection: EMPTY_SELECTION }), [scope]);
    return [state.scope === scope ? state.selection : EMPTY_SELECTION, setSelection, clear];
}
