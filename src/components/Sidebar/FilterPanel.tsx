import React from 'react';
import styles from './FilterPanel.module.css';

export interface FilterState {
    minRating: number;
    colorLabel?: string;
    keyword?: string;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
}

interface FilterPanelProps {
    filters: FilterState;
    onChange: (filters: FilterState) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ filters, onChange }) => {

    const handleRatingChange = (r: number) => {
        onChange({ ...filters, minRating: r });
    };

    const handleColorChange = (c?: string) => {
        onChange({ ...filters, colorLabel: c });
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

            <div>
                <div className={styles.sectionLabel}>Color Label</div>
                <div className={styles.colorRow}>
                    <button
                        onClick={() => handleColorChange(undefined)}
                        className={styles.colorAllButton}
                        style={{ background: !filters.colorLabel ? '#555' : '#333' }}
                    >
                        All
                    </button>
                    {[
                        { id: 'Red', color: '#e53935', tooltip: 'Red: Reject (technical failure)' },
                        { id: 'Yellow', color: '#fdd835', tooltip: 'Yellow: Maybe (the middle)' },
                        { id: 'Green', color: '#43a047', tooltip: 'Green: Reference shot (high technical)' },
                        { id: 'Blue', color: '#1e88e5', tooltip: 'Blue: Portfolio shot (high aesthetic & sharp)' },
                        { id: 'Purple', color: '#8e24aa', tooltip: 'Purple: Creative/moody (aesthetic beats technical)' },
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
        </div>
    );
};
