import React from 'react';
import styles from './FilterPanel.module.css';
import { CalendarPicker } from './CalendarPicker';

export interface FilterState {
    minRating: number;
    colorLabel?: string;
    keyword?: string;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
    capturedDate?: string;
}

interface FilterPanelProps {
    filters: FilterState;
    onChange: (filters: FilterState) => void;
    folderId?: number;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ filters, onChange, folderId }) => {

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
                <div className={styles.sectionLabel}>Shot on Date</div>
                <CalendarPicker
                    value={filters.capturedDate || ''}
                    onChange={handleDateChange}
                    folderId={folderId}
                    minRating={filters.minRating}
                    colorLabel={filters.colorLabel}
                    keyword={filters.keyword}
                />
            </div>
        </div>
    );
};
