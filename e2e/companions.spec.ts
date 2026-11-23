import { expect, test } from '@playwright/test';

// a companion added from the side bar: its own sheet, the master and it a click apart, each entry's pop-out with what
// a fight asks of it, and its hit points set from there. SHOTS (a folder) keeps screenshots of each step
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (process.env['SHOTS']) await page.screenshot({path: `${process.env['SHOTS']}/${name}.png`});
};

test('adds a companion from the side bar and goes back and forth between it and its master', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);
  const party = page.locator('app-party-nav');
  await expect(party.locator('.member')).toHaveCount(1);
  await shot(page, '1-master');

  await party.getByRole('button', {name: 'Add a companion'}).click();
  await page.locator('select.companion-kind').selectOption('cohort');
  await page.locator('input.companion-name').fill('Fang');
  await page.locator('button.companion-create').click();
  // the companion's sheet opens, the master leads the side bar
  await expect(page.locator('.nameInput, input.pf-input--name').first()).toHaveValue('Fang');
  await expect(party.locator('.member')).toHaveCount(2);
  await expect(party.locator('.member.current .member__avatar')).toHaveText('F');
  // what it is, its master a link away
  await expect(page.locator('.companion-of')).toContainText('cohort of Nairabrab');
  await shot(page, '2-companion-sheet');

  // the master's pop-out, and back to its sheet
  await party.locator('.member').first().hover();
  await expect(party.locator('.member__popout .member__name')).toBeVisible();
  await shot(page, '3-master-popout');
  await party.locator('.member__link').first().click();
  await expect(page.locator('.nameInput, input.pf-input--name').first()).not.toHaveValue('Fang');

  // the companion's hit points, from its pop-out on the master's sheet
  await party.locator('.member').nth(1).hover();
  await expect(party.locator('.member__popout .member__name')).toHaveText('Fang');
  await shot(page, '4-companion-popout');
  await party.locator('.member__popout button.hp-button').click();
  await expect(page.locator('.hp-dialog .pf-dialog__title')).toContainText('Fang');
  await shot(page, '5-companion-hit-points');

  // in the character list, under its master
  await page.locator('.hp-done').click();
  await page.locator('a.side-nav__back').click();
  await expect(page.locator('.roster-companions .pf-roster__name')).toHaveText('Fang');
  await shot(page, '6-character-list');
});

test('adds a familiar whose numbers come from its master', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);
  const party = page.locator('app-party-nav');
  await party.getByRole('button', {name: 'Add a companion'}).click();
  await page.locator('select.companion-kind').selectOption('familiar');
  await page.locator('input.companion-name').fill('Whiskers');
  // which of the master's classes count: the example has its barbarian levels only
  await page.locator('.companion-class', {hasText: 'Barbarian'}).locator('input').check();
  await page.locator('button.companion-create').click();
  await expect(page.locator('.companion-of')).toContainText('familiar of Nairabrab');
  await expect(page.locator('.companion-classes-open')).toHaveText('(Barbarian 1)');
  // half the master's 17 hit points, and the abilities of master class level 1
  await expect(page.locator('.hp-row .hp-button__max')).toHaveText('/8');
  await expect(page.locator('.feature-item__name', {hasText: 'Improved Evasion'})).toBeVisible();
  await shot(page, '7-familiar-sheet');
});

test('adds an animal companion with its statistics by level', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);
  await page.locator('app-party-nav').getByRole('button', {name: 'Add a companion'}).click();
  await page.locator('select.companion-kind').selectOption('animal companion');
  await page.locator('input.companion-name').fill('Fang');
  await page.locator('.companion-class', {hasText: 'Barbarian'}).locator('input').check();
  await page.locator('button.companion-create').click();
  await expect(page.locator('.companion-of')).toContainText('animal companion of Nairabrab');
  // an effective druid 1: 2 HD, Link, Share Spells, a bonus trick
  await expect(page.locator('.feature-item__name', {hasText: 'Bonus Tricks (1)'})).toBeVisible();
  await expect(page.locator('.feature-item__name', {hasText: 'Link'}).first()).toBeVisible();
  await shot(page, '8-animal-companion');
});

test('a synthesist\'s eidolon: the summoner fuses with it through its Fused form', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);
  const party = page.locator('app-party-nav');
  await party.getByRole('button', {name: 'Add a companion'}).click();
  await page.locator('select.companion-kind').selectOption('eidolon');
  await page.locator('input.companion-name').fill('Crimson');
  await page.locator('.companion-class', {hasText: 'Barbarian'}).locator('input').check();
  await page.locator('input.companion-synthesist').check();
  await page.locator('button.companion-create').click();
  await expect(page.locator('.companion-of')).toContainText('eidolon of Nairabrab');
  // back to the summoner: its Fused form, off, among its forms
  await party.locator('.member__link').first().click();
  const fused = page.locator('.forms .condition-tag', {hasText: 'Fused'});
  await expect(fused).toBeVisible();
  await fused.locator('input.feature-active').check();
  await expect(page.locator('.set-aside')).toContainText('set aside in Fused');
  await party.locator('.member').nth(1).hover();
  await expect(party.locator('.member__role')).toContainText('eidolon, fused');
  await shot(page, '9-synthesist-fused');
});
