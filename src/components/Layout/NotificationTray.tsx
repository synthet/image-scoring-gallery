import React from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import styles from './NotificationTray.module.css';

export const NotificationTray: React.FC = () => {
    const { notifications, removeNotification } = useNotificationStore();

    if (notifications.length === 0) return null;

    return (
        <div className={styles.tray}>
            {notifications.map((n) => (
                <div
                    key={n.id}
                    className={styles.notification}
                    style={{ borderLeft: `4px solid ${getColor(n.type)}` }}
                >
                    <div className={styles.icon} style={{ color: getColor(n.type) }}>
                        {getIcon(n.type)}
                    </div>
                    <div className={styles.message}>
                        {n.message}
                    </div>
                    <button
                        className={styles.dismiss}
                        onClick={() => removeNotification(n.id)}
                        aria-label="Dismiss notification"
                    >
                        <X size={16} />
                    </button>
                </div>
            ))}
        </div>
    );
};

function getColor(type: string) {
    switch (type) {
        case 'success': return '#4caf50';
        case 'warning': return '#ff9800';
        case 'error': return '#f44336';
        default: return '#2196f3';
    }
}

function getIcon(type: string) {
    switch (type) {
        case 'success': return <CheckCircle size={18} />;
        case 'warning': return <AlertTriangle size={18} />;
        case 'error': return <XCircle size={18} />;
        default: return <Info size={18} />;
    }
}
