import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon } from 'lucide-react';
import styles from './CalendarPicker.module.css';
import { bridge } from '../../bridge';

interface CalendarPickerProps {
    value: string; // YYYY-MM-DD
    onChange: (value: string) => void;
}

export const CalendarPicker: React.FC<CalendarPickerProps> = ({ value, onChange }) => {
    const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
    const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const fetchDates = async () => {
            try {
                const dates = await bridge.getDatesWithShots();
                setActiveDates(new Set(dates));
            } catch (err) {
                console.error('Failed to fetch active dates:', err);
            }
        };
        fetchDates();
    }, []);

    const daysInMonth = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();
        
        // Adjust for Monday start if needed, but let's keep it simple with Sunday start for now
        // or localize it. Let's use 0 = Sunday.
        
        const days = [];
        // Pad start
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        // Month days
        for (let d = 1; d <= lastDate; d++) {
            days.push(d);
        }
        return days;
    }, [viewDate]);

    const navigateMonth = (delta: number) => {
        const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
        setViewDate(next);
    };

    const handleDateSelect = (day: number) => {
        const year = viewDate.getFullYear();
        const month = String(viewDate.getMonth() + 1).padStart(2, '0');
        const date = String(day).padStart(2, '0');
        const formatted = `${year}-${month}-${date}`;
        onChange(formatted);
        setIsOpen(false);
    };

    const clearDate = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setIsOpen(false);
    };

    const isToday = (day: number) => {
        const now = new Date();
        return now.getFullYear() === viewDate.getFullYear() &&
               now.getMonth() === viewDate.getMonth() &&
               now.getDate() === day;
    };

    const isSelected = (day: number) => {
        if (!value) return false;
        const d = new Date(value);
        return d.getFullYear() === viewDate.getFullYear() &&
               d.getMonth() === viewDate.getMonth() &&
               d.getDate() === day;
    };

    const hasShots = (day: number) => {
        const year = viewDate.getFullYear();
        const month = String(viewDate.getMonth() + 1).padStart(2, '0');
        const date = String(day).padStart(2, '0');
        const formatted = `${year}-${month}-${date}`;
        return activeDates.has(formatted);
    };

    const monthName = viewDate.toLocaleString('default', { month: 'long' });

    return (
        <div className={styles.container}>
            <div className={styles.inputWrapper} onClick={() => setIsOpen(!isOpen)}>
                <CalendarIcon size={16} className={styles.icon} />
                <span className={value ? styles.activeValue : styles.placeholder}>
                    {value || 'Filter by shot date...'}
                </span>
                {value && (
                    <button className={styles.clearBtn} onClick={clearDate}>
                        <X size={14} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <button onClick={() => navigateMonth(-1)}><ChevronLeft size={18} /></button>
                        <span className={styles.monthTitle}>{monthName} {viewDate.getFullYear()}</span>
                        <button onClick={() => navigateMonth(1)}><ChevronRight size={18} /></button>
                    </div>

                    <div className={styles.weekdays}>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => (
                            <div key={w} className={styles.weekday}>{w}</div>
                        ))}
                    </div>

                    <div className={styles.grid}>
                        {daysInMonth.map((day, idx) => (
                            <div key={idx} className={styles.cell}>
                                {day && (
                                    <button
                                        className={`
                                            ${styles.day} 
                                            ${isSelected(day) ? styles.selected : ''} 
                                            ${isToday(day) ? styles.today : ''}
                                            ${hasShots(day) ? styles.hasShots : ''}
                                        `}
                                        onClick={() => handleDateSelect(day)}
                                    >
                                        {day}
                                        {hasShots(day) && <div className={styles.dot} />}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className={styles.footer}>
                        <button className={styles.todayBtn} onClick={() => {
                            const now = new Date();
                            setViewDate(now);
                            handleDateSelect(now.getDate());
                        }}>Today</button>
                    </div>
                </div>
            )}
        </div>
    );
};
