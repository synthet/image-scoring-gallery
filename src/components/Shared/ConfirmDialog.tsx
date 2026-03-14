import React, { useEffect, useRef, useCallback } from 'react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);

    // Auto-focus: cancel for danger, confirm for default
    useEffect(() => {
        if (!isOpen) return;
        const focusTarget = variant === 'danger' ? cancelRef.current : confirmRef.current;
        focusTarget?.focus();
    }, [isOpen, variant]);

    // Trap focus within dialog
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
            return;
        }
        if (e.key === 'Tab') {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled])'
            );
            if (!focusable || focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }, [onCancel]);

    // Close on backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onCancel();
    }, [onCancel]);

    if (!isOpen) return null;

    return (
        <div
            className={styles.backdrop}
            onClick={handleBackdropClick}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            onKeyDown={handleKeyDown}
        >
            <div className={styles.dialog} ref={dialogRef}>
                <h3 id="confirm-dialog-title" className={styles.title}>{title}</h3>
                <p id="confirm-dialog-message" className={styles.message}>{message}</p>
                <div className={styles.actions}>
                    <button
                        ref={cancelRef}
                        className={styles.cancelButton}
                        onClick={onCancel}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmRef}
                        className={variant === 'danger' ? styles.dangerButton : styles.confirmButton}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
