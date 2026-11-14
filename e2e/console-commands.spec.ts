import { expect, test } from '@playwright/test';

test('pf1.importExample() saves the example character and opens its sheet', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);
  await expect(page.locator('.nameInput')).toHaveValue('Nairabrab');

  await page.goto('/');
  await expect(page.getByRole('link', {name: 'Nairabrab'})).toBeVisible();
});
