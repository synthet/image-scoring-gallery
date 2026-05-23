import { useCallback, useRef, useState } from 'react';
import type { TextSearchResponse } from '../../electron/apiTypes';
import { bridge } from '../bridge';

export type SemanticSearchStatus = 'idle' | 'loading' | 'success' | 'error' | 'cancelled';

export interface SemanticSearchParams {
    query: string;
    limit?: number;
    folder_path?: string;
    min_similarity?: number;
}

function isAbortError(err: unknown): boolean {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    if (err instanceof Error) {
        if (err.name === 'AbortError') return true;
        const msg = err.message.toLowerCase();
        if (msg.includes('abort')) return true;
    }
    return false;
}

export function useSemanticTextSearch() {
    const [status, setStatus] = useState<SemanticSearchStatus>('idle');
    const [data, setData] = useState<TextSearchResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeQuery, setActiveQuery] = useState('');
    const requestIdRef = useRef(0);

    const search = useCallback(async (params: SemanticSearchParams) => {
        const text = params.query.trim();
        if (!text) return;

        const reqId = ++requestIdRef.current;
        setActiveQuery(text);
        setStatus('loading');
        setError(null);

        try {
            const result = await bridge.searchByText({
                query: text,
                limit: params.limit,
                folder_path: params.folder_path,
                min_similarity: params.min_similarity,
            });
            if (requestIdRef.current !== reqId) return;
            setData(result);
            setStatus('success');
        } catch (err: unknown) {
            if (requestIdRef.current !== reqId) return;
            if (isAbortError(err)) {
                setStatus('cancelled');
                return;
            }
            const message = err instanceof Error ? err.message : String(err);
            setError(message || 'Search failed');
            setStatus('error');
        }
    }, []);

    const cancel = useCallback(() => {
        requestIdRef.current += 1;
        void bridge.cancelTextSearch();
        setStatus((s) => (s === 'loading' ? 'cancelled' : s));
    }, []);

    const reset = useCallback(() => {
        requestIdRef.current += 1;
        void bridge.cancelTextSearch();
        setActiveQuery('');
        setData(null);
        setError(null);
        setStatus('idle');
    }, []);

    return {
        status,
        isSearching: status === 'loading',
        data,
        error,
        activeQuery,
        search,
        cancel,
        reset,
    };
}
