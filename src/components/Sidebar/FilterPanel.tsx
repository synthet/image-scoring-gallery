import React from 'react';
import styles from './FilterPanel.module.css';
import { CalendarPicker } from './CalendarPicker';
import { getEffectiveKeyword } from '../../utils/keywordFilters';

export interface FilterState {
    minRating: number;
    colorLabel?: string;
    keyword?: string;
    /** UI-only: second-level species filter when keyword is `birds`. */
    speciesKeyword?: string;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
    capturedDate?: string;
    /** Minimum clip_quality_v0 score (0–100 in UI, converted to 0–1 for queries). */
    minClipQualityV0?: number;
}

interface FilterPanelProps {
    filters: FilterState;
    onChange: (filters: FilterState) => void;
    folderId?: number;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ filters, onChange, folderId }) => {
    const effectiveKeyword = getEffectiveKeyword(filters);

    const handleRatingChange = (r: number) => {
        onChange({ ...filters, minRating: r });
    };

    const handleColorChange = (c?: string) => {
        onChange({ ...filters, colorLabel: c });
    };

    const handleDateChange = (date: string) => {
        onChange({ ...filters, capturedDate: date || undefined });
    };

    return (
        <div className={styles.panel}>
            <div className={styles.section}>
                <div className={styles.sectionLabel}>Minimum Rating</div>
                <div className={styles.ratingRow}>
                    {[0, 1, 2, 3, 4, 5].map(r => (
                        <button
                            key={r}
                            onClick={() => handleRatingChange(r)}
                            className={filters.minRating === r ? styles.ratingButtonActive : styles.ratingButton}
                        >
                            {r === 0 ? 'All' : r}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionLabel}>Color Label</div>
                <div className={styles.colorRow}>
                    <button
                        onClick={() => handleColorChange(undefined)}
                        className={styles.colorAllButton}
                        style={{ background: !filters.colorLabel ? 'var(--input-border)' : 'var(--input-bg)' }}
                    >
                        All
                    </button>
                    {[
                        { id: 'Red', color: 'var(--label-red)', tooltip: 'Red: Reject (technical failure)' },
                        { id: 'Yellow', color: 'var(--label-yellow)', tooltip: 'Yellow: Maybe (the middle)' },
                        { id: 'Green', color: 'var(--label-green)', tooltip: 'Green: Reference shot (high technical)' },
                        { id: 'Blue', color: 'var(--label-blue)', tooltip: 'Blue: Portfolio shot (high aesthetic & sharp)' },
                        { id: 'Purple', color: 'var(--label-purple)', tooltip: 'Purple: Creative/moody (aesthetic beats technical)' },
                    ].map(({ id, color, tooltip }) => (
                        <button
                            key={id}
                            onClick={() => handleColorChange(id === filters.colorLabel ? undefined : id)}
                            className={`${styles.colorDot} ${filters.colorLabel === id ? styles.colorDotActive : ''}`}
                            style={{ background: color }}
                            title={tooltip}
                            aria-label={tooltip}
                        />
                    ))}
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionLabel}>Min CLIP Quality</div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={filters.minClipQualityV0 ?? 0}
                    onChange={(e) =>
                        onChange({
                            ...filters,
                            minClipQualityV0: parseInt(e.target.value, 10) || undefined,
                        })
                    }
                    style={{ width: '100%' }}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {filters.minClipQualityV0 ?? 0}%
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionLabel}>Shot on Date</div>
                <CalendarPicker
                    value={filters.capturedDate || ''}
                    onChange={handleDateChange}
                    folderId={folderId}
                    minRating={filters.minRating}
                    colorLabel={filters.colorLabel}
                    keyword={effectiveKeyword}
                />
            </div>
        </div>
    );
};
