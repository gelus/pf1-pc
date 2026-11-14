import { expect, test } from '@playwright/test';

const item = (id: string, name: string, weight: number, adjustments: any, extra: any = {}) => ({
  id, name, type: 'armor', weight, quantity: 1, equipped: true, slot: 'armor',
  cost: {pp: 0, gp: 0, sp: 0, cp: 0}, description: '',
  features: [{id: id + '-f', name, adjustments}], ...extra,
});

const character = {
  id: 'adjustment-modes-e2e',
  name: 'Capped Cassie',
  classLevels: [],
  race: {
    name: 'Halfling',
    subtype: 'Halfling',
    features: [{id: 'racial-stats', name: 'racial-stats', adjustments: {
      size: {value: 3, mode: 'set'}, 'speed.land': {value: 20, mode: 'set'}, languages: 'Common',
    }}],
  },
  abilityScores: {str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10},
  feats: [],
  conditions: [],
  inventory: [
    item('chain', 'Chain Shirt', 25, {ac: {value: 4, type: 'armor'}, maxDexBonus: {value: 4, mode: 'min'}}),
    item('shield', 'Tower Shield', 45, {ac: {value: 4, type: 'shield'}, maxDexBonus: {value: 2, mode: 'min'}}, {slot: 'held'}),
  ],
};

test('the lowest max dex bonus caps the dex bonus to AC, and set adjustments show in tooltips', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(char => {
    localStorage.setItem('characters', JSON.stringify([char.id]));
    localStorage.setItem('character-' + char.id, JSON.stringify(char));
  }, character);

  await page.goto('/adjustment-modes-e2e');
  await expect(page.locator('.bio')).toContainText('Small');
  // 10 + 4 armor + 4 shield + dex 4 capped by the tower shield at 2
  await expect(page.locator('.defense div').first()).toHaveText('AC: 20 Touch: 12 Flat-Footed: 18');

  const speed = page.locator('.offense div stat').first();
  await expect(speed).toHaveText('20');
  await speed.hover();
  await expect(speed.locator('.tooltip li')).toHaveText(['=20 racial-stats']);
});

test('a new character takes its racial size and speed as set values', async ({ page }) => {
  await page.goto('/new-character');
  await page.locator('.race select').selectOption({label: 'Small'});
  await page.locator('.race input[type=number]').fill('20');
  await page.getByRole('button', {name: 'Save'}).click();

  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('characters')!));
  const id = ids[ids.length - 1];
  const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('character-' + id)!), id);
  expect(saved.race.features[0].adjustments.size).toEqual({value: 3, mode: 'set'});
  expect(saved.race.features[0].adjustments['speed.land']).toEqual({value: 20, mode: 'set'});

  await page.goto('/' + id);
  await expect(page.locator('.bio')).toContainText('Small');
  await expect(page.locator('.offense')).toContainText(/Speed 20\s*ft\./);
});
