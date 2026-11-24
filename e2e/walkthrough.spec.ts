import { expect, test, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// two characters made to try the app end to end: SHOTS (a folder) keeps a screenshot of each step
//  - Brakka, the human totem warrior barbarian the AI made in src/app/ai/walkthrough-totem-warrior.spec.ts (the chat with
//    the AI's turns scripted), opened in the app: its rage switched on, its health ring, and the conditions its hit
//    points put it under
//  - a cloistered cleric made by hand: the class levels editor's archetype, its proficiencies, class skills and spells
const shot = async (page: Page, name: string) => {
  if (process.env['SHOTS']) await page.screenshot({path: `${process.env['SHOTS']}/${name}.png`, fullPage: true});
};
const brakka = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'brakka.json'), 'utf8'));

test('the barbarian the AI made: rage switched on, its health ring, and dying', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(char => {
    localStorage.setItem('characters', JSON.stringify([char.id]));
    localStorage.setItem('character-' + char.id, JSON.stringify(char));
  }, brakka);
  await page.goto('/' + brakka.id);
  await expect(page.locator('.classlevels')).toContainText('Barbarian (Totem Warrior) 2');
  await expect(page.locator('app-party-nav app-hp-ring')).toHaveAttribute('aria-label', '28 of 28 hp');
  await shot(page, 'brakka-1-sheet');

  // rage on: +4 Str (17 + 2 + 4), -2 AC
  const rage = page.locator('.specialAttacks .feature-item', {hasText: 'Rage'});
  await expect(rage.locator('.feature-item__charges')).toContainText('7/7');
  await rage.locator('input.feature-active').check();
  await expect(page.locator('.statistics')).toContainText(/Str 23 /);
  await shot(page, 'brakka-2-raging');
  await rage.locator('input.feature-active').uncheck();

  // the side bar's ring holds the letter, full
  const ring = page.locator('app-party-nav app-hp-ring');
  await expect(ring).toHaveAttribute('aria-label', '28 of 28 hp');
  await expect(ring.locator('.member__avatar')).toHaveText('B');

  // down to -3: dying, under the name with its full tooltip
  await page.locator('app-party-nav .member').first().hover();
  await page.locator('.member__popout .member__hp').click();
  await page.locator('.hp-current-input').fill('-3');
  await page.locator('.hp-done').click();
  await expect(ring).toHaveAttribute('aria-label', '-3 of 28 hp');
  const dying = page.locator('.conditions .rule-condition', {hasText: 'Dying'});
  await expect(dying).toBeVisible();
  await expect(dying).not.toHaveAttribute('title', /.+/);
  await dying.locator('.name').hover();
  const tip = page.locator('.pf-tip');
  await expect(tip.locator('.pf-label')).toHaveText('Dying');
  await expect(tip.locator('.tip-note')).toContainText('from hit points');
  await expect(tip.locator('.tip-text')).toContainText('Constitution check');
  await shot(page, 'brakka-3-dying-tooltip');
});

// a cloistered cleric (Ultimate Magic), made by hand: light armor and five weapons only, no shields, 4 + Int ranks,
// every Knowledge a class skill with +1/2 level, one domain and one spell fewer a day at each level from 1st
test('a cleric made by hand, with the cloistered cleric archetype taken in the class levels editor', async ({ page }) => {
  await page.goto('/new-character');
  await page.locator('input.nameInput').fill('Sister Ilse Varn');
  await page.locator('.race label', {hasText: 'Race:'}).locator('input').fill('Human');
  const scores: {[ability: string]: number} = {str: 10, dex: 12, con: 12, int: 14, wis: 16, cha: 10};
  for (const [ability, score] of Object.entries(scores)) {
    const row = page.locator('.abilities > div', {has: page.locator(`span:text-is("${ability}")`)});
    await row.locator('input[type=number]').first().fill(String(score));
  }
  // the human's +2, on Wisdom
  await page.locator('.abilities > div', {has: page.locator('span:text-is("wis")')}).locator('input[type=number]').nth(1).fill('2');

  // the class, from its preset, and the archetype taken at its 1st level
  // the new character page starts with an empty class level: it becomes the cleric's
  await expect(page.locator('.class-level-card')).toHaveCount(1);
  await page.locator('.remove-class-level-btn').click();
  await page.locator('.class-preset-select').selectOption('Cleric');
  const card = page.locator('.class-level-card').first();
  await expect(page.locator('.class-level-card')).toHaveCount(1);
  await card.locator('.class-skillranks-input').fill('4');
  await card.locator('.add-archetype-btn').click();
  const draft = card.locator('.archetype-draft');
  await draft.locator('.archetype-draft-name').fill('Cloistered Cleric');
  await draft.locator('.archetype-draft-replaces').fill('none');
  await draft.locator('.archetype-draft-skills-add').fill('knowledge (dungeoneering), knowledge (engineering), knowledge (geography), knowledge (local), knowledge (nature), linguistics');
  await draft.locator('.archetype-draft-weapons-add').fill('club, heavy mace, light mace, quarterstaff, sling');
  await draft.locator('.archetype-draft-weapons-remove').fill('simple');
  await draft.locator('.archetype-draft-armor-remove').fill('medium, shield');
  await draft.locator('.archetype-draft-casting').selectOption('changes');
  await draft.locator('.archetype-draft-per-day').fill('-1');
  await expect(draft.locator('.archetype-draft-problems')).toHaveCount(0);
  await shot(page, 'ilse-1-archetype-draft');
  await draft.locator('.take-archetype-btn').click();
  await expect(card.locator('.archetype-name')).toHaveText('Cloistered Cleric');
  await expect(card.locator('.archetype-changes')).toContainText('proficiencies − simple, medium, shield');
  await expect(card.locator('.archetype-changes')).toContainText('spellcasting: spells per day change -1');

  // its 1st-level feature: +1/2 level (min 1) on every Knowledge check
  await card.locator('.add-feature-btn').click();
  const feature = card.locator('.feature-array-item').last();
  await feature.locator('.feature-name-input').fill('Breadth of Knowledge');
  await feature.locator('.feature-description-input').fill('+1/2 cleric level (minimum +1) on Knowledge checks, and Knowledge checks untrained');
  await feature.locator('.add-adjustment-btn').click();
  await feature.locator('.key-input').fill('skills.knowledge.subSkills.*.value');
  await feature.locator('.value-type-select').selectOption('string');
  await feature.locator('.string-value-input').fill('max(1, floor({level.cleric}/2))');
  await shot(page, 'ilse-2-class-level');
  await page.getByRole('button', {name: 'Save'}).click();

  // the sheet
  await expect(page.locator('.classlevels')).toContainText('Cleric (Cloistered Cleric) 1');
  await shot(page, 'ilse-3-sheet');
  const saved = await page.evaluate(() => {
    const ids = JSON.parse(localStorage.getItem('characters')!);
    return JSON.parse(localStorage.getItem('character-' + ids[ids.length - 1])!);
  });
  const level = saved.classLevels[0];
  expect(level.archetypes[0]).toEqual(jasmineLike({name: 'Cloistered Cleric', replaces: []}));
  expect(level.proficiencies.weapons.sort()).toEqual(['club', 'heavy mace', 'light mace', 'quarterstaff', 'sling']);
  expect(level.proficiencies.armor).toEqual(['light']);
  expect(level.classSkills).toContain('knowledge (local)');
  expect(level.classSkills).toContain('linguistics');
  expect(level.spellcasting.perDayChange).toBe(-1);

  // spells: 3 orisons; 1st level 1 - 1 + 1 (Wis 18) and the domain slot. one domain
  await page.locator('.domains-input').fill('knowledge');
  await page.locator('.domains-input').press('Enter');
  const first = page.locator('.spell-level').nth(1);
  await expect(first.locator('.charges-total')).toHaveText('1');
  await expect(first.locator('.extra-slot')).toContainText('1/1');
  await expect(page.locator('.spell-level').first().locator('.at-will')).toContainText('prepares 3');

  // the skills: knowledge (local) a class skill, untrained: Int 2 + Breadth 1
  await page.locator('.tab-skills').click();
  const local = page.locator('.sub-skill', {hasText: 'Local'});
  await expect(local.locator('.skill-total')).toContainText('3');
  await expect(local).toHaveClass(/classSkill/);
  await shot(page, 'ilse-4-skills');

  // a cohort from the side bar: two rings, and its hit points down to 0, disabled, with the condition's tooltip
  const party = page.locator('app-party-nav');
  await party.getByRole('button', {name: 'Add a companion'}).click();
  await page.locator('select.companion-kind').selectOption('cohort');
  await page.locator('input.companion-name').fill('Brother Aldo');
  await page.locator('button.companion-create').click();
  await expect(party.locator('app-hp-ring')).toHaveCount(2);
  await party.locator('.member__link').first().click();
  await expect(page.locator('.classlevels')).toContainText('Cloistered Cleric');
  // the cohort has no class levels yet, so no hit points to lose: the cleric goes down to 0 instead
  await party.locator('.member').first().hover();
  await party.locator('.member__popout .member__hp').click();
  await page.locator('.hp-current-input').fill('0');
  await page.locator('.hp-done').click();
  await expect(party.locator('app-hp-ring').first()).toHaveAttribute('aria-label', '0 of 9 hp');
  const disabled = page.locator('.conditions .rule-condition', {hasText: 'Disabled'});
  await disabled.locator('.name').hover();
  await expect(page.locator('.pf-tip .tip-note')).toContainText('from hit points');
  await shot(page, 'ilse-5-cohort-disabled');
});

const jasmineLike = (fields: object) => expect.objectContaining(fields);
