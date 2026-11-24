import { expect, test } from '@playwright/test';

test('takes back changes to the sheet and brings them back, and saves what is undone', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);

  // the current hp, shown on the sheet's hp button and set in its dialog
  const hp = page.locator('.hp-row .hp-button__current');
  const setHp = async (value: string) => {
    await page.locator('.hp-row button.hp-button').click();
    await page.locator('.hp-current-input').fill(value);
    await page.locator('.hp-done').click();
  };
  // undo and redo are in the settings, at the bottom left
  const settings = page.getByRole('button', {name: 'Settings'});
  const undo = page.getByRole('button', {name: 'Undo'});
  // a click elsewhere closes them, and the page settles a moment after a click: open them until undo shows
  const openSettings = async () => {
    await expect(async () => {
      if (!await undo.isVisible()) await settings.click();
      await expect(undo).toBeVisible({timeout: 500});
    }).toPass({timeout: 5000});
  };
  const redo = page.getByRole('button', {name: 'Redo'});
  const full = (await hp.textContent())!.trim();
  await openSettings();
  await expect(undo).toBeDisabled();

  await setHp('3');
  await openSettings();
  await expect(undo).toBeEnabled();
  // the rests are in a dialog, opened from the Rest button under the name
  await page.locator('.rest-open').click();
  // a rest closes the dialog once it is taken
  await page.locator('button.rest-night').click();
  await openSettings();
  await expect(undo).toHaveAttribute('title', 'Undo: rest for the night');

  // the rest, then the damage
  await undo.click();
  await expect(hp).toHaveText('3');
  await undo.click();
  await expect(hp).toHaveText(full);
  await expect(undo).toBeDisabled();

  // ctrl+shift+z redoes outside a text field
  await page.keyboard.press('Control+Shift+Z');
  await expect(hp).toHaveText('3');
  await openSettings();
  await expect(redo).toHaveAttribute('title', 'Redo: rest for the night');

  // what the undo left is what was saved
  await page.reload();
  await expect(hp).toHaveText('3');
  await openSettings();
  await expect(page.getByRole('button', {name: 'Undo'})).toBeDisabled();
});
