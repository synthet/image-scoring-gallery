import fs from 'node:fs';
import path from 'node:path';

const LOG_PREFIX = 'session_';
const LOG_EXTENSION = '.log';
const LOG_FILE_PATTERN = /^session_(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.log$/;

export interface SessionLogPolicy {
    maxBytesPerFile: number;
    retentionDays: number;
    maxFiles: number;
    cleanupIntervalMs: number;
}

export const DEFAULT_SESSION_LOG_POLICY: SessionLogPolicy = {
    maxBytesPerFile: 5 * 1024 * 1024, // 5MB per file
    retentionDays: 14,
    maxFiles: 200,
    cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
};

export class SessionLogManager {
    private lastCleanupAt = 0;

    constructor(private readonly logDir: string, private readonly policy: SessionLogPolicy = DEFAULT_SESSION_LOG_POLICY) { }

    public async getWritableLogPath(now: Date): Promise<string> {
        const dateStr = now.toISOString().split('T')[0];
        const baseName = `${LOG_PREFIX}${dateStr}`;

        await fs.promises.mkdir(this.logDir, { recursive: true });
        await this.maybeCleanup(now);

        const firstFile = path.join(this.logDir, `${baseName}${LOG_EXTENSION}`);
        if (await this.canAppendToFile(firstFile)) {
            return firstFile;
        }

        let suffix = 1;
        while (true) {
            const candidate = path.join(this.logDir, `${baseName}.${suffix}${LOG_EXTENSION}`);
            if (await this.canAppendToFile(candidate)) {
                return candidate;
            }
            suffix += 1;
        }
    }

    private async maybeCleanup(now: Date): Promise<void> {
        if (now.getTime() - this.lastCleanupAt < this.policy.cleanupIntervalMs) {
            return;
        }

        await this.cleanupOldLogs(now);
        this.lastCleanupAt = now.getTime();
    }

    private async canAppendToFile(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.size < this.policy.maxBytesPerFile;
        } catch {
            return true;
        }
    }

    public async cleanupOldLogs(now: Date): Promise<void> {
        const entries = await this.listSessionLogs();

        if (entries.length === 0) {
            return;
        }

        const cutoffTime = now.getTime() - this.policy.retentionDays * 24 * 60 * 60 * 1000;

        const expired = entries.filter((entry) => entry.date.getTime() < cutoffTime);
        await Promise.all(expired.map((entry) => fs.promises.rm(entry.filePath, { force: true })));

        const remaining = entries
            .filter((entry) => entry.date.getTime() >= cutoffTime)
            .sort((a, b) => a.date.getTime() - b.date.getTime() || a.suffix - b.suffix);

        if (remaining.length <= this.policy.maxFiles) {
            return;
        }

        const overage = remaining.length - this.policy.maxFiles;
        const toDelete = remaining.slice(0, overage);
        await Promise.all(toDelete.map((entry) => fs.promises.rm(entry.filePath, { force: true })));
    }

    private async listSessionLogs(): Promise<Array<{ filePath: string; date: Date; suffix: number }>> {
        const dirEntries = await fs.promises.readdir(this.logDir, { withFileTypes: true }).catch(() => []);

        return dirEntries
            .filter((entry) => entry.isFile())
            .map((entry) => {
                const match = entry.name.match(LOG_FILE_PATTERN);
                if (!match) {
                    return null;
                }

                const [, datePart, suffixPart] = match;
                const parsedDate = new Date(`${datePart}T00:00:00.000Z`);
                if (Number.isNaN(parsedDate.getTime())) {
                    return null;
                }

                return {
                    filePath: path.join(this.logDir, entry.name),
                    date: parsedDate,
                    suffix: Number.parseInt(suffixPart ?? '0', 10)
                };
            })
            .filter((entry): entry is { filePath: string; date: Date; suffix: number } => entry !== null);
    }
}
