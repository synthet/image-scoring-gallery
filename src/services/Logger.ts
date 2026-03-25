import { bridge } from '../bridge';

export class Logger {
    static info(message: string, data?: unknown) {
        this.log('INFO', message, data);
    }

    static error(message: string, data?: unknown) {
        this.log('ERROR', message, data);
    }

    static debug(message: string, data?: unknown) {
        this.log('DEBUG', message, data);
    }

    static warn(message: string, data?: unknown) {
        this.log('WARN', message, data);
    }

    private static log(level: string, message: string, data?: unknown) {
        // Log to console for dev (only WARN and ERROR to reduce noise)
        if (level === 'ERROR') console.error(message, data);
        else if (level === 'WARN') console.warn(message, data);
        // Suppress INFO and DEBUG from console to reduce noise
        // else console.log(`[${level}] ${message}`, data);

        bridge.log(level, message, data).catch((err: unknown) => {
            console.error('Failed to send log to backend', err);
        });
    }
}
