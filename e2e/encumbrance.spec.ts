import { expect, test } from '@playwright/test';

const item = (id: string, name: string, weight: number, extra: any = {}) => ({
  id, name, type: 'other', weight, quantity: 1, equipped: false, carried: true, slot: 'slotless',
  cost: {pp: 0, gp: 0, sp: 0, cp: 0}, description: '', features: [], ...extra,
});

const character = {
  id: 'encumbrance-e2e',
  name: 'Pack Mule Pete',
  classLevels: [],
  race: {
    name: 'Human',
    subtype: 'Human',
    features: [{id: 'racial-stats', name: 'racial-stats', adjustments: {size: {value: 4, mode: 'set'}, 'speed.land': {value: 30, mode: 'set'}, languages: 'Common'}}],
  },
  abilityScores: {str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10},
  feats: [],
  conditions: [],
  wealth: {pp: 0, gp: 50, sp: 0, cp: 0},
  inventory: [
    item('chain', 'Chain Shirt', 25, {
      type: 'armor', equipped: true, slot: 'armor', speed: [30, 20],
      features: [{id: 'chain-f', name: 'Chain Shirt', adjustments: {ac: {value: 4, type: 'armor'}, maxDexBonus: {value: 4, mode: 'min'}, armorCheckPenalty: -2}}],
    }),
    item('tent', 'Tent', 20),
  ],
};

test('a medium load slows the character down and caps its dex bonus until it drops the tent', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(char => {
    localStorage.setItem('characters', JSON.stringify([char.id]));
    localStorage.setItem('character-' + char.id, JSON.stringify(char));
  }, character);

  await page.goto('/encumbrance-e2e');
  await expect(page.locator('.offense')).toContainText(/Speed 20\s*ft\./);
  // 10 + 4 armor + dex 4 capped at 3 by the load (the chain shirt allows 4)
  await expect(page.locator('.defense div').first()).toHaveText('AC: 17 Touch: 13 Flat-Footed: 14');

  // the equipment is on its own tab of the sheet
  await page.locator('.sheet-tabs .tab-equipment').click();
  // 25 + 20 + 1 lb. of coins = 46 lbs., a medium load for Str 10
  await expect(page.locator('.encumbrance')).toHaveText(/Carrying\s+46 \/ 100 lbs\.\s*\(Medium load\)/);

  // leave the tent behind
  await page.locator('.inventoryList', {hasText: 'Tent'}).locator('.item-carried').uncheck();
  await expect(page.locator('.encumbrance')).toHaveText(/Carrying\s+26 \/ 100 lbs\.\s*\(Light load\)/);
  await page.locator('.sheet-tabs .tab-sheet').click();
  await expect(page.locator('.offense')).toContainText(/Speed 30\s*ft\./);
  await expect(page.locator('.defense div').first()).toHaveText('AC: 18 Touch: 14 Flat-Footed: 14');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('character-encumbrance-e2e')!));
  expect(saved.inventory.find((i: any) => i.id === 'tent').carried).toBe(false);
});
