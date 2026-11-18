import { expect, test } from '@playwright/test';

const entry = (name: string, level: number, extra: any = {}) => ({
  name, level, features: [], hitDice: 8, rolledHp: 0, classSkills: [], skillRanks: 2, startingWealth: 0, ...extra,
});

// a fighter 2 / rogue 1, with the progressions of their classes
const character = {
  id: 'class-progression-e2e',
  name: 'Two Trades Tam',
  classLevels: [
    entry('Fighter', 1, {hitDice: 10, babProgression: 'full', goodSaves: ['fort'], favoredClassBonus: 'hp'}),
    entry('Fighter', 2, {hitDice: 10, rolledHp: 6, favoredClassBonus: 'hp'}),
    entry('Rogue', 1, {rolledHp: 4, babProgression: 'threeQuarters', goodSaves: ['ref'], skillRanks: 8}),
  ],
  favoredClasses: ['Fighter'],
  experience: 4000,
  advancementTrack: 'medium',
  race: {name: 'Human', subtype: 'Human', features: [{id: 'racial-stats', name: 'racial-stats', adjustments: {size: {value: 4, mode: 'set'}, 'speed.land': {value: 30, mode: 'set'}, languages: 'Common'}}]},
  abilityScores: {str: 10, dex: 10, con: 12, int: 10, wis: 10, cha: 10},
  feats: [],
  conditions: [],
  inventory: [],
};

test('works out bab, saves and hit points of a multiclass character, and shows when it can level up', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(char => {
    localStorage.setItem('characters', JSON.stringify([char.id]));
    localStorage.setItem('character-' + char.id, JSON.stringify(char));
  }, character);
  await page.goto('/class-progression-e2e');

  // fighter 2 gives 2, rogue 1 gives 0
  await expect(page.locator('.statistics')).toContainText(/BAB 2 /);
  // fort: fighter 3 + rogue 0 + con 1, ref: fighter 0 + rogue 2
  await expect(page.locator('.defense')).toContainText(/Fort 4\s+Ref 2\s+Will 0/);
  // 10 + 6 + 4 rolled, con 1 per level, 2 favored class levels
  await expect(page.locator('.max-hp')).toHaveText('25');
  await page.locator('.max-hp').hover();
  await expect(page.locator('.max-hp .tooltip')).toContainText('Fighter 2 (hit dice)');
  await expect(page.locator('.max-hp .tooltip')).toContainText('Favored class (HP)');

  await expect(page.locator('.character-level')).toHaveText('3');
  await expect(page.locator('.level-up')).toHaveCount(0);
  await expect(page.locator('.feat-count')).toHaveText('(0 / 2)');

  // the level opens the xp and the track
  await page.locator('.level-button').click();
  await expect(page.locator('.next-level-xp')).toHaveText('9000');
  await page.locator('.xp-input').fill('9000');
  await expect(page.locator('.level-up')).toBeVisible();
  // on the fast track the next level comes earlier
  await page.locator('.advancement-track').selectOption('fast');
  await expect(page.locator('.next-level-xp')).toHaveText('6000');
  await page.getByRole('button', {name: 'Done'}).click();

  // take the 4th level from the class level form, it owes an ability increase
  await page.locator('.level-up').click();
  await page.locator('.class-preset-select').selectOption('Rogue');
  await expect(page.locator('.class-level-card').last()).toContainText('Rogue (Lvl 2)');
  await page.getByRole('button', {name: 'confirm'}).click();

  await expect(page.locator('.character-level')).toHaveText('4');
  await expect(page.locator('.pending-ability-increases')).toHaveText('1 ability increase to assign');
  // rogue 2 gives 1
  await expect(page.locator('.statistics')).toContainText(/BAB 3 /);

  await page.locator('.pending-ability-increases').click();
  await page.locator('.class-ability-increase-select').selectOption('str');
  await page.getByRole('button', {name: 'confirm'}).click();
  await expect(page.locator('.pending-ability-increases')).toHaveCount(0);
  await expect(page.locator('.statistics')).toContainText(/Str 11 /);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('character-class-progression-e2e')!));
  expect(saved.experience).toBe(9000);
  expect(saved.advancementTrack).toBe('fast');
  expect(saved.classLevels[3].abilityIncrease).toBe('str');
  expect(saved.favoredClasses).toEqual(['Fighter']);
});

test('the example barbarian keeps its numbers with bab and saves from its progression', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).pf1.importExample());
  await page.waitForURL(/\/233df670-4c29-4e4a-9b65-829064c3e3f5$/);

  await expect(page.locator('.statistics')).toContainText(/BAB 1 /);
  await page.locator('.statistics stat[stat="bab"]').hover();
  await expect(page.locator('.statistics .tooltip')).toContainText('Barbarian 1 (BAB)');
  // fort 2 + con 5 (14, +2 racial, +4 rage), will +2 morale from rage - 1 wis
  await expect(page.locator('.defense')).toContainText(/Fort 7\s+Ref 2\s+Will 1/);
  await expect(page.locator('.max-hp')).toHaveText('17');
  await expect(page.locator('.feat-count')).toHaveText('(1 / 1)');
});
