import fs from 'fs';
import path from 'path';

/** View-menu overlay toggles persisted across restarts (`view-prefs.json` in userData). */
export type ViewPrefs = {
    showBoundingBox: boolean;
    showEyes: boolean;
    showFocusPoint: boolean;
};

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
    showBoundingBox: false,
    showEyes: false,
    showFocusPoint: true,
};

export function viewPrefsPath(userDataDir: string): string {
    return path.join(userDataDir, 'view-prefs.json');
}

/** Reads saved prefs; missing file, bad JSON, or non-boolean fields fall back to defaults. */
export function loadViewPrefs(userDataDir: string): ViewPrefs {
    const prefs = { ...DEFAULT_VIEW_PREFS };
    try {
        const raw = JSON.parse(fs.readFileSync(viewPrefsPath(userDataDir), 'utf8')) as Record<string, unknown>;
        for (const key of Object.keys(prefs) as Array<keyof ViewPrefs>) {
            if (typeof raw?.[key] === 'boolean') prefs[key] = raw[key] as boolean;
        }
    } catch {
        /* first run or unreadable file: defaults */
    }
    return prefs;
}

export function saveViewPrefs(userDataDir: string, prefs: ViewPrefs): void {
    try {
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.writeFileSync(viewPrefsPath(userDataDir), JSON.stringify(prefs, null, 2), 'utf8');
    } catch (e) {
        console.warn('[viewPrefs] Failed to save view prefs:', e);
    }
}
