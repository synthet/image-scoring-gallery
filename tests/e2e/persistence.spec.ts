import { clickMenu, closeApp, menuItemState } from './harness';
import { expect, test } from './fixture';

test.describe('Journey 2: persistence across relaunch', () => {
    test('a View toggle changed in one run is kept in the next run with the same profile', async ({ env, launchApp }) => {
        const first = await launchApp();
        // Focus Point defaults on (view-prefs.json); turn it off.
        expect(await menuItemState(first.app, ['View', 'Focus Point'])).toMatchObject({ checked: true });
        await clickMenu(first.app, ['View', 'Focus Point']);
        await expect.poll(() => menuItemState(first.app, ['View', 'Focus Point'])).toMatchObject({ checked: false });
        await closeApp(first);

        const second = await launchApp();
        expect(await menuItemState(second.app, ['View', 'Focus Point'])).toMatchObject({ checked: false });
        // Same profile on disk: the second run used the first run's userData.
        expect(await second.app.evaluate(({ app }) => app.getPath('userData'))).toBe(env.userData);
    });
});
