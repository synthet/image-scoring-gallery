import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_PREFS, loadViewPrefs, saveViewPrefs, viewPrefsPath } from './viewPrefsStore';

describe('viewPrefsStore', () => {
    let dir: string;
    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'view-prefs-')); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('defaults to Focus Point on and the other overlays off', () => {
        expect(loadViewPrefs(dir)).toEqual({ showBoundingBox: false, showEyes: false, showFocusPoint: true });
    });

    it('round-trips saved prefs', () => {
        saveViewPrefs(dir, { showBoundingBox: true, showEyes: true, showFocusPoint: false });
        expect(loadViewPrefs(dir)).toEqual({ showBoundingBox: true, showEyes: true, showFocusPoint: false });
    });

    it('ignores corrupt files and non-boolean fields', () => {
        fs.writeFileSync(viewPrefsPath(dir), '{ not json');
        expect(loadViewPrefs(dir)).toEqual(DEFAULT_VIEW_PREFS);
        fs.writeFileSync(viewPrefsPath(dir), JSON.stringify({ showEyes: 'yes', showFocusPoint: false }));
        expect(loadViewPrefs(dir)).toEqual({ ...DEFAULT_VIEW_PREFS, showFocusPoint: false });
    });
});
