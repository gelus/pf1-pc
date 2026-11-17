import { expect, test } from '@playwright/test';

const character = {
  id: 'size-e2e',
  name: 'Little Lem',
  classLevels: [],
  race: {
    name: 'Halfling',
    subtype: 'Halfling',
    features: [{id: 'racial-stats', name: 'racial-stats', adjustments: {
      size: {value: 3, mode: 'set'}, 'speed.land': {value: 20, mode: 'set'}, languages: 'Common',
    }}],
  },
  abilityScores: {str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10},
  feats: [],
  conditions: [],
  inventory: [],
};

test('a small character gets the size modifiers on AC, CMB, CMD and Stealth', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(char => {
    localStorage.setItem('characters', JSON.stringify([char.id]));
    localStorage.setItem('character-' + char.id, JSON.stringify(char));
  }, character);

  await page.goto('/size-e2e');
  await expect(page.locator('.bio')).toContainText('Small');
  // 10 + 2 dex + 1 size
  await expect(page.locator('.defense div').first()).toHaveText('AC: 13 Touch: 13 Flat-Footed: 11');

  const statistics = page.locator('.statistics div').nth(1);
  const cmb = statistics.locator('stat').nth(1);
  const cmd = statistics.locator('stat').nth(2);
  // 0 bab + 0 str - 1 size
  await expect(cmb).toHaveText('-1');
  // 10 + 0 bab + 0 str + 2 dex - 1 size
  await expect(cmd).toHaveText('11');
  await cmb.hover();
  await expect(cmb.locator('.tooltip')).toContainText('Size (Small)');

  // 2 dex + 4 size
  const stealth = page.locator('.skill', {hasText: 'stealth'}).locator('.skill-total stat');
  await expect(stealth).toHaveText('6');
  await stealth.hover();
  await expect(stealth.locator('.tooltip')).toContainText('Size (Small)');
});
