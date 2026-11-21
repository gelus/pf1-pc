import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {Feature} from '../interfaces/character.interface';
import {ABILITIES, availableFeats} from '../rules/class-progression';
import {pointBuyTotal} from '../rules/point-buy';
import {Character} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';
import {armorCategoryOf, isArmor, isShield} from '../utils/equipment.util';
import {Item} from '../utils/item.class';
import {purseToCopper} from '../utils/wealth.util';
import {coreArmorCategory, isAttackAdjustment} from './builders';
import {kitGaps} from './gear-prices';

// the check of a character the AI created, run by the app (no AI in it) before the creation may end: everything the
// sheet needs from each step, set and consistent. errors hold the creation open until they are fixed, warnings are
// told to the player. the AI is given the list and fixes it with the usual tools; nothing here guesses or changes
// anything

export interface CharacterCheck {
  errors: string[];
  warnings: string[];
}

// a feature that changes no number says what it does in its description: the source and the app's notes are not that
const SOURCE_AND_NOTES = /(^|\n)\s*(source:.*|built by the ai.*|the player described it.*|looked up.*)$/gim;
const saysSomething = (feature: Feature): boolean => {
  const own = String(feature.description || '').replace(SOURCE_AND_NOTES, '').trim();
  if (own) return true;
  // the text of its sheet entry (a special quality shown with what it does)
  return Object.values(feature.adjustments || {}).some(value => value && typeof value === 'object'
    && !Array.isArray(value) && ['description', 'descriptionOnly'].some(k => String((value as any)[k] ?? '').trim()));
};
const changesSomething = (feature: Feature): boolean => Object.entries(feature.adjustments || {}).some(([path, value]) => {
  // a sheet entry changes what its own adjustments change
  if (value && typeof value === 'object' && !Array.isArray(value) && 'adjustments' in (value as object)) {
    return Object.keys((value as any).adjustments || {}).length > 0;
  }
  return path !== 'descriptionOnly';
});

// the alignments a core class allows (Core Rulebook, each class's Alignment)
const ALIGNMENT_RULES: [RegExp, (a: string) => boolean, string][] = [
  [/^paladin$/i, a => a === 'LG', 'lawful good'],
  [/^monk$/i, a => a.startsWith('L'), 'lawful'],
  [/^barbarian$/i, a => !a.startsWith('L'), 'any nonlawful'],
  [/^druid$/i, a => a.includes('N'), 'any neutral'],
];
const NEEDS_DEITY = /^(cleric|inquisitor|warpriest)$/i;

const weaponProficient = (applied: Character, item: Item): boolean => {
  const known = (applied.proficiencies?.weapons || []).map(w => String(w).toLowerCase());
  const group = String((item as Item & {proficiency?: string}).proficiency || '').toLowerCase();
  const name = String(item.name || '').toLowerCase().replace(/^(masterwork|mwk)\s+|\s*\+\d+$/g, '');
  return !group || known.includes(group) || known.includes(name) || known.some(k => k && name.includes(k));
};

export const checkCreatedCharacter = (service: ApplyCharacterService): CharacterCheck => {
  const raw = service.raw();
  const applied = service.applied();
  const errors: string[] = [];
  const warnings: string[] = [];
  const decisions = raw.creation?.decisions || {};

  // who they are
  if (!String(raw.name || '').trim() || raw.name === new Character().name) errors.push('the character has no name (set_character_details name)');

  // ability scores
  const base = raw.abilityScores || {};
  if (ABILITIES.every(a => base[a] === 10)) errors.push('the ability scores are not set');
  const outside = ABILITIES.filter(a => !(base[a] >= 3 && base[a] <= 18));
  if (outside.length) errors.push(`base ability scores are 3 to 18 before the race: ${outside.map(a => `${a} ${base[a]}`).join(', ')}`);
  const budget = Number(/(\d+)-point buy/.exec(String(decisions['ability-scores'] ?? ''))?.[1]);
  if (budget > 0 && pointBuyTotal(base) > budget) errors.push(`the scores cost ${pointBuyTotal(base)} points, more than the ${budget}-point buy`);

  // race
  if (!raw.race?.name || !(raw.race.features || []).length) errors.push('the race is not set');
  else {
    if (!(Number(applied.speed?.land) > 0)) errors.push(`the race gives no land speed (its racial stats need "speed.land": {"value": 30, "mode": "set"})`);
    if (!raw.race.features.some(f => Object.keys(f.adjustments || {}).some(p => p.startsWith('abilityScores.')))) {
      errors.push('the race adjusts no ability score (its modifiers, or the +2 the player picked)');
    }
  }
  const languages = Array.isArray(applied.languages) ? applied.languages : String(applied.languages || '').split(',').filter(l => l.trim());
  if (!languages.length) errors.push('the character speaks no language');

  // class
  const levels = raw.classLevels || [];
  if (!levels.length) errors.push('the character has no class level');
  const first = levels[0];
  if (first) {
    const missing = [
      ...([6, 8, 10, 12].includes(Number(first.hitDice)) ? [] : ['hit die']),
      ...(first.babProgression ? [] : ['bab']),
      ...((first.goodSaves || []).length ? [] : ['good saves']),
      ...(Number(first.skillRanks) > 0 ? [] : ['skill ranks per level']),
      ...((first.classSkills || []).length ? [] : ['class skills']),
    ];
    if (missing.length) errors.push(`${first.name} is missing its ${missing.join(', ')}`);
    if (!(Number(first.startingWealth) > 0)) errors.push(`${first.name} has no starting gold`);
    if (!(applied.proficiencies?.weapons || []).length) errors.push(`${first.name} gives no weapon proficiencies (every class has some: its page's "Weapon and Armor Proficiency")`);
    if (!(raw.favoredClasses || []).length) errors.push('there is no favored class (usually the first class)');
    else if ((raw.favoredClasses || []).some(c => c.toLowerCase() === String(first.name).toLowerCase()) && !first.favoredClassBonus) {
      errors.push(`${first.name} is the favored class but its level has no favored class bonus (the player's pick: +1 hp or +1 skill rank)`);
    }
    for (const [named, allows, said] of ALIGNMENT_RULES) {
      if (levels.some(l => named.test(String(l.name || ''))) && !allows(String(raw.alignment))) {
        errors.push(`a ${String(levels.find(l => named.test(String(l.name || '')))!.name).toLowerCase()} is ${said}, not ${raw.alignment}`);
      }
    }
    if (levels.some(l => NEEDS_DEITY.test(String(l.name || ''))) && !String(raw.deity || '').trim()) {
      warnings.push('a divine class without a deity (set_character_details deity, or say the philosophy it serves)');
    }
  }
  if (!(Number(applied.hp) >= 1)) errors.push('the character has no hit points');

  // every feature says or does something
  const lists: [string, Feature[]][] = [
    ['racial trait', raw.race?.features || []],
    ['class feature', levels.flatMap(l => l.features || [])],
    ['feat', raw.feats || []],
    ['trait', raw.traits || []],
    ['drawback', raw.drawbacks || []],
  ];
  for (const [kind, features] of lists) {
    const blank = features.filter(f => !changesSomething(f) && !saysSomething(f)).map(f => f.name || kind);
    if (blank.length) errors.push(`${blank.join(', ')}: a ${kind} with no adjustments and no description of its rules`);
  }

  // skills and feats spent
  const ranks = skillRankBudget(applied);
  if (ranks.spent < ranks.available) errors.push(`${ranks.available - ranks.spent} of ${ranks.available} skill ranks are not spent`);
  if (ranks.spent > ranks.available) errors.push(`${ranks.spent} skill ranks are spent, the character has ${ranks.available}`);
  const level = characterLevel(raw);
  const tooMany = Object.entries(raw.skills || {}).flatMap(([name, skill]) => [
    ...((skill.ranks || 0) > level ? [name] : []),
    ...Object.entries(skill.subSkills || {}).filter(([, sub]) => (sub.ranks || 0) > level).map(([sub]) => `${name} (${sub})`),
  ]);
  if (tooMany.length) errors.push(`at most ${level} rank${level > 1 ? 's' : ''} per skill: ${tooMany.join(', ')}`);
  const feats = (raw.feats || []).length;
  const allowed = availableFeats(applied);
  if (feats < allowed) errors.push(`${allowed - feats} of ${allowed} feats are not taken`);
  if (feats > allowed) errors.push(`${feats} feats are taken, the character has ${allowed}`);
  const traitsAllowed = 2 + (raw.drawbacks || []).length + (Number(raw.bonusTraits) || 0);
  if ((raw.traits || []).length > traitsAllowed) errors.push(`${raw.traits.length} traits, the character has ${traitsAllowed}`);

  // gear
  const inventory = raw.inventory || [];
  if (levels.length && Number(first?.startingWealth) > 0) {
    const left = purseToCopper(new RemainingStartingWealthPipe().transform(raw));
    if (left < 0) errors.push(`the gear costs ${-left / 100} gp more than the starting gold`);
  }
  if (!inventory.length) errors.push('the character has no gear');
  for (const item of inventory) {
    const name = item.name || 'an item';
    const features = (item.features || []) as Feature[];
    if (item.type === 'weapon' && !features.some(f => Object.keys(f.adjustments || {}).some(isAttackAdjustment))) {
      errors.push(`${name} is a weapon with no attack (its damage, critical and range)`);
    }
    if (isArmor(item) && !isShield(item)) {
      const category = armorCategoryOf(item);
      const core = coreArmorCategory(name);
      if (!category) errors.push(`${name} has no armor category (light, medium or heavy)`);
      else if (core && core !== category) errors.push(`${name} is ${core} armor, not ${category}`);
      const speed = (item as any).speed;
      if ((category === 'medium' || category === 'heavy') && !(Array.isArray(speed) && speed.length)) {
        errors.push(`${name} is ${category} armor with no speed: [20, 15] (what it slows a 30 ft. and a 20 ft. speed to)`);
      }
      const proficiency = category === 'light' || category === 'medium' || category === 'heavy' ? category : undefined;
      if (item.equipped && proficiency && !(applied.proficiencies?.armor || []).map(a => String(a).toLowerCase()).includes(proficiency)) {
        warnings.push(`${name} is ${proficiency} armor the character is not proficient with: its check penalty goes on attack rolls`);
      }
    }
    if (item.type === 'weapon' && !weaponProficient(applied, item)) warnings.push(`the character is not proficient with ${name} (-4 to hit)`);
  }
  const gaps = kitGaps(inventory.map(i => String(i.name || '')), false);
  if (gaps.length) warnings.push(`the kit has no ${gaps.join(', nor ')}`);

  return {errors, warnings};
};
