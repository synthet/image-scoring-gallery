import { useEffect, useState } from 'react';
import { bridge } from '../bridge';
import { FALLBACK_MODEL_SORT_OPTIONS, type SortOption } from '../../electron/scoringModels';

export type { SortOption };

export function useScoringSortOptions() {
    const [sortOptions, setSortOptions] = useState<SortOption[]>(FALLBACK_MODEL_SORT_OPTIONS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const options = await bridge.api.getScoringSortOptions();
                if (!cancelled && Array.isArray(options) && options.length > 0) {
                    setSortOptions(options);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                    setSortOptions(FALLBACK_MODEL_SORT_OPTIONS);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    return { sortOptions, loading, error };
}

export function isSortOptionValue(value: string | undefined, options: SortOption[]): boolean {
    if (!value) return false;
    return options.some((o) => o.value === value);
}
