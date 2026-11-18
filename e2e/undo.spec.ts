import { expect, test } from '@playwright/test';

test('takes back changes to the sheet and brings them back, and saves what is undone', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);

  const hp = page.locator('input.current-hp');
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
  const full = await hp.inputValue();
  await openSettings();
  await expect(undo).toBeDisabled();

  await hp.fill('3');
  await hp.blur();
  await expect(undo).toBeEnabled();
  // the rests are in a dialog, opened from the Rest button under the name
  await page.locator('.rest-open').click();
  await page.locator('button.rest-night').click();
  await page.getByRole('button', {name: 'Done'}).click();
  await openSettings();
  await expect(undo).toHaveAttribute('title', 'Undo: rest for the night');

  // the rest, then the damage
  await undo.click();
  await expect(hp).toHaveValue('3');
  await undo.click();
  await expect(hp).toHaveValue(full);
  await expect(undo).toBeDisabled();

  // ctrl+shift+z redoes outside a text field
  await page.keyboard.press('Control+Shift+Z');
  await expect(hp).toHaveValue('3');
  await openSettings();
  await expect(redo).toHaveAttribute('title', 'Redo: rest for the night');

  // what the undo left is what was saved
  await page.reload();
  await expect(hp).toHaveValue('3');
  await openSettings();
  await expect(page.getByRole('button', {name: 'Undo'})).toBeDisabled();
});
