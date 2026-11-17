import { expect, test } from '@playwright/test';

// talks to the real Gemini through Firebase AI Logic. App Check guards it and reCAPTCHA does not run here, so the test
// needs a debug token of the project (Firebase console, App Check, Apps, Manage debug tokens) in the environment:
//   PF1_APP_CHECK_DEBUG_TOKEN=... npx playwright test e2e/ai-chat.spec.ts
// never commit the token, anyone holding it passes App Check
const debugToken = process.env['PF1_APP_CHECK_DEBUG_TOKEN'];

test('the AI reads the sheet with its tools and answers', async ({ page }) => {
  test.skip(!debugToken, 'set PF1_APP_CHECK_DEBUG_TOKEN to talk to the AI');
  test.setTimeout(90_000);
  await page.goto('/');
  await page.evaluate(token => (window as any).pf1.setAppCheckDebugToken(token), debugToken);
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);

  await page.getByRole('button', {name: 'Ask'}).click();
  const chat = page.getByRole('region', {name: 'Ask the AI'});
  await expect(chat).toContainText('Ask about your character or the rules');

  await chat.getByRole('textbox', {name: 'message'}).fill('What is my AC?');
  await chat.getByRole('button', {name: 'Send'}).click();
  await expect(chat.locator('.message.player')).toHaveText('What is my AC?');
  await expect(chat.locator('.message.ai').last()).not.toBeEmpty({timeout: 60_000});
  await expect(chat.locator('.message.error')).toHaveCount(0);
  await expect(chat.locator('.message.tool').first()).toBeVisible();
  await page.screenshot({path: 'test-results/ai-chat.png'});
});
