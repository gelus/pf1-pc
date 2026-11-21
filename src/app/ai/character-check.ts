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
import {isAttackAdjustment} from './builders';
import {hasOutfit} from './gear-prices';

// what a ranged weapon shoots, by the words its name uses
const AMMUNITION = /\b(arrows?|bolts?|bullets?|darts?|ammunition|shots?|stones?|cartridges?|pellets?)\b/i;

// the check of a character the AI created, run by the app (no AI in it) before the creation may end: everything the
// sheet needs from each step, set and consistent. errors hold the creation open until they are fixed, warnings are
// told to the player. the AI is given the list and fixes it with the usual tools; nothing here guesses or changes
// anything

export interface CharacterCheck {
  errors: string[];
  warnings: string[];
}

interface Context {
  service: ApplyCharacterService;
  raw: Character;
  applied: Character;
  decisions: {[step: string]: string};
  levels: Character['classLevels'];
  inventory: Item[];
}

// one thing the app requires of a created character: the creation step it belongs to (checked when that step is
// completed, and all of them before the creation ends), what it requires in a line (each step's guide lists its
// requirements, so the AI is told them before it builds), and the check, giving errors and warnings
interface Requirement {
  step: string;
  requires: string;
  check: (c: Context) => {errors?: string[], warnings?: string[]} | string[] | void;
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

// whether an alignment is one a class's rule allows, read the way class pages write it: "lawful good", "any lawful",
// "any nonlawful", "any neutral", "lawful neutral or lawful good", "any". a rule read no other way allows any
const AXES: {[word: string]: (a: string) => boolean} = {
  lawful: a => a[0] === 'L', chaotic: a => a[0] === 'C', good: a => a[1] === 'G' || (a === 'NG'), evil: a => a[1] === 'E',
  neutral: a => a.includes('N'),
};
const NAMED: {[name: string]: string} = {
  'lawful good': 'LG', 'neutral good': 'NG', 'chaotic good': 'CG', 'lawful neutral': 'LN', 'neutral': 'N', 'true neutral': 'N',
  'chaotic neutral': 'CN', 'lawful evil': 'LE', 'neutral evil': 'NE', 'chaotic evil': 'CE',
};
export const allowsAlignment = (rule: string, alignment: string): boolean => {
  const options = rule.toLowerCase().split(/\s*(?:,|\bor\b)\s*/).map(o => o.trim()).filter(Boolean);
  let understood = false;
  for (const option of options) {
    if (option === 'any') return true;
    if (NAMED[option]) { understood = true; if (NAMED[option] === alignment) return true; continue; }
    const any = /^any (non-?)?(lawful|chaotic|good|evil|neutral)$/.exec(option);
    if (any) { understood = true; if (AXES[any[2]](alignment) !== !!any[1]) return true; }
  }
  return !understood;
};

const weaponProficient = (applied: Character, item: Item): boolean => {
  const known = (applied.proficiencies?.weapons || []).map(w => String(w).toLowerCase());
  const group = String((item as Item & {proficiency?: string}).proficiency || '').toLowerCase();
  const name = String(item.name || '').toLowerCase().replace(/^(masterwork|mwk)\s+|\s*\+\d+$/g, '');
  return !group || known.includes(group) || known.includes(name) || known.some(k => k && name.includes(k));
};

const blankFeatures = (kind: string, features: Feature[]): string[] => {
  const blank = features.filter(f => !changesSomething(f) && !saysSomething(f)).map(f => f.name || kind);
  return blank.length ? [`${blank.join(', ')}: a ${kind} with no adjustments and no description of its rules`] : [];
};

const REQUIREMENTS: Requirement[] = [
  // ability scores
  {step: 'ability-scores', requires: 'all six base scores set, 3 to 18 before the race', check: ({raw}) => {
    const base = raw.abilityScores || {};
    if (ABILITIES.every(a => base[a] === 10)) return ['the ability scores are not set'];
    const outside = ABILITIES.filter(a => !(base[a] >= 3 && base[a] <= 18));
    return outside.length ? [`base ability scores are 3 to 18 before the race: ${outside.map(a => `${a} ${base[a]}`).join(', ')}`] : [];
  }},
  {step: 'ability-scores', requires: 'a point buy costing no more than its points', check: ({raw, decisions}) => {
    const budget = Number(/(\d+)-point buy/.exec(String(decisions['ability-scores'] ?? ''))?.[1]);
    const total = pointBuyTotal(raw.abilityScores || {});
    return budget > 0 && total > budget ? [`the scores cost ${total} points, more than the ${budget}-point buy`] : [];
  }},

  // race
  {step: 'race', requires: 'the race set with its traits', check: ({raw}) =>
    raw.race?.name && (raw.race.features || []).length ? [] : ['the race is not set']},
  {step: 'race', requires: 'its ability modifiers (or the +2 where the player put it) in the racial stats', check: ({raw}) =>
    !(raw.race?.features || []).length || raw.race.features.some(f => Object.keys(f.adjustments || {}).some(p => p.startsWith('abilityScores.')))
      ? [] : ['the race adjusts no ability score (its modifiers, or the +2 the player picked)']},
  {step: 'race', requires: 'its base land speed and size, "mode": "set"', check: ({raw, applied}) =>
    !(raw.race?.features || []).length || Number(applied.speed?.land) > 0
      ? [] : ['the race gives no land speed (its racial stats need "speed.land": {"value": 30, "mode": "set"})']},
  {step: 'race', requires: 'its languages', check: ({applied}) => {
    const languages = Array.isArray(applied.languages) ? applied.languages : String(applied.languages || '').split(',').filter(l => l.trim());
    return languages.length ? [] : ['the character speaks no language'];
  }},
  {step: 'race', requires: 'every racial trait with its numbers as adjustments, or its rules in its description', check: ({raw}) =>
    blankFeatures('racial trait', raw.race?.features || [])},

  // class
  {step: 'class', requires: 'a 1st class level with its hit die, bab, good saves, skill ranks and class skills', check: ({levels}) => {
    const first = levels[0];
    if (!first) return ['the character has no class level'];
    const missing = [
      ...([6, 8, 10, 12].includes(Number(first.hitDice)) ? [] : ['hit die']),
      ...(first.babProgression ? [] : ['bab']),
      ...((first.goodSaves || []).length ? [] : ['good saves']),
      ...(Number(first.skillRanks) > 0 ? [] : ['skill ranks per level']),
      ...((first.classSkills || []).length ? [] : ['class skills']),
    ];
    return missing.length ? [`${first.name} is missing its ${missing.join(', ')}`] : [];
  }},
  {step: 'class', requires: 'its starting gold', check: ({levels}) =>
    !levels[0] || Number(levels[0].startingWealth) > 0 ? [] : [`${levels[0].name} has no starting gold`]},
  {step: 'class', requires: 'its weapon and armor proficiencies', check: ({levels, applied}) =>
    !levels[0] || (applied.proficiencies?.weapons || []).length ? []
      : [`${levels[0].name} gives no weapon proficiencies (every class has some: its page's "Weapon and Armor Proficiency")`]},
  {step: 'class', requires: 'a favored class, and the favored class bonus the player picked (+1 hp or +1 skill rank)', check: ({raw, levels}) => {
    const first = levels[0];
    if (!first) return [];
    if (!(raw.favoredClasses || []).length) return ['there is no favored class (usually the first class)'];
    return (raw.favoredClasses || []).some(c => c.toLowerCase() === String(first.name).toLowerCase()) && !first.favoredClassBonus
      ? [`${first.name} is the favored class but its level has no favored class bonus (the player's pick: +1 hp or +1 skill rank)`] : [];
  }},
  {step: 'class', requires: 'hit points', check: ({levels, applied}) =>
    !levels.length || Number(applied.hp) >= 1 ? [] : ['the character has no hit points']},
  {step: 'class', requires: 'every class feature of the 1st-level row, with its numbers as adjustments or its rules in its description', check: ({levels}) =>
    blankFeatures('class feature', levels.flatMap(l => l.features || []))},

  // skills
  {step: 'skills', requires: 'every skill rank spent, at most one per character level in a skill', check: ({raw, applied}) => {
    const errors: string[] = [];
    const ranks = skillRankBudget(applied);
    if (ranks.spent < ranks.available) errors.push(`${ranks.available - ranks.spent} of ${ranks.available} skill ranks are not spent`);
    if (ranks.spent > ranks.available) errors.push(`${ranks.spent} skill ranks are spent, the character has ${ranks.available}`);
    const level = characterLevel(raw);
    const tooMany = Object.entries(raw.skills || {}).flatMap(([name, skill]) => [
      ...((skill.ranks || 0) > level ? [name] : []),
      ...Object.entries(skill.subSkills || {}).filter(([, sub]) => (sub.ranks || 0) > level).map(([sub]) => `${name} (${sub})`),
    ]);
    if (tooMany.length) errors.push(`at most ${level} rank${level > 1 ? 's' : ''} per skill: ${tooMany.join(', ')}`);
    return errors;
  }},

  // feats
  {step: 'feats', requires: 'every feat the character has taken, each with its numbers or its rules', check: ({raw, applied}) => {
    const feats = (raw.feats || []).length;
    const allowed = availableFeats(applied);
    return [
      ...(feats < allowed ? [`${allowed - feats} of ${allowed} feats are not taken`] : []),
      ...(feats > allowed ? [`${feats} feats are taken, the character has ${allowed}`] : []),
      ...blankFeatures('feat', raw.feats || []),
    ];
  }},

  // traits
  {step: 'traits', requires: 'at most two traits (one more per drawback), each with its numbers or its rules', check: ({raw}) => {
    const allowed = 2 + (raw.drawbacks || []).length + (Number(raw.bonusTraits) || 0);
    return [
      ...((raw.traits || []).length > allowed ? [`${raw.traits.length} traits, the character has ${allowed}`] : []),
      ...blankFeatures('trait', raw.traits || []), ...blankFeatures('drawback', raw.drawbacks || []),
    ];
  }},

  // equipment
  {step: 'equipment', requires: 'gear bought within the starting gold', check: ({raw, levels, inventory}) => {
    const errors = inventory.length ? [] : ['the character has no gear'];
    if (levels.length && Number(levels[0]?.startingWealth) > 0) {
      const left = purseToCopper(new RemainingStartingWealthPipe().transform(raw));
      if (left < 0) errors.push(`the gear costs ${-left / 100} gp more than the starting gold`);
    }
    return errors;
  }},
  {step: 'equipment', requires: 'every weapon with its attack (damage, critical, range)', check: ({inventory}) =>
    inventory.filter(item => item.type === 'weapon' && !((item.features || []) as Feature[]).some(f => Object.keys(f.adjustments || {}).some(isAttackAdjustment)))
      .map(item => `${item.name || 'a weapon'} is a weapon with no attack (its damage, critical and range)`)},
  {step: 'equipment', requires: 'armor with its category, and medium or heavy armor with the speed it slows to', check: ({inventory, applied}) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const item of inventory.filter(i => isArmor(i) && !isShield(i))) {
      const name = item.name || 'armor';
      const category = armorCategoryOf(item);
      if (!category) errors.push(`${name} has no armor category (light, medium or heavy)`);
      const speed = (item as any).speed;
      if ((category === 'medium' || category === 'heavy') && !(Array.isArray(speed) && speed.length)) {
        errors.push(`${name} is ${category} armor with no speed: [20, 15] (what it slows a 30 ft. and a 20 ft. speed to)`);
      }
      if (item.equipped && category && !(applied.proficiencies?.armor || []).map(a => String(a).toLowerCase()).includes(category)) {
        warnings.push(`${name} is ${category} armor the character is not proficient with: its check penalty goes on attack rolls`);
      }
    }
    return {errors, warnings};
  }},
  {step: 'equipment', requires: 'ammunition for a weapon that shoots it, and an outfit (the first is free)', check: ({inventory, applied}) => {
    const shoots = inventory.filter(item => item.type === 'weapon' && ((item.features || []) as Feature[]).some(f =>
      ((f.adjustments as any)?.ranged || []).some((a: any) => a && !a.thrown)) && !AMMUNITION.test(String(item.name || '')));
    const hasAmmunition = inventory.some(item => AMMUNITION.test(String(item.name || '')));
    return {warnings: [
      ...inventory.filter(item => item.type === 'weapon' && !weaponProficient(applied, item)).map(item => `the character is not proficient with ${item.name} (-4 to hit)`),
      ...(shoots.length && !hasAmmunition ? [`${shoots.map(i => i.name).join(', ')} shoot${shoots.length === 1 ? 's' : ''} ammunition the kit has none of`] : []),
      ...(hasOutfit(inventory) ? [] : ['the kit has no outfit (the first is free: an explorer\'s outfit)']),
    ]};
  }},

  // details
  {step: 'details', requires: 'a name', check: ({raw}) =>
    String(raw.name || '').trim() && raw.name !== new Character().name ? [] : ['the character has no name (set_character_details name)']},
  {step: 'details', requires: 'an alignment each class allows (its page\'s Alignment)', check: ({raw, levels}) =>
    levels.filter((l, i) => l.alignment && levels.findIndex(o => o.name === l.name) === i && !allowsAlignment(l.alignment, String(raw.alignment)))
      .map(l => `a ${String(l.name).toLowerCase()} is ${l.alignment}, not ${raw.alignment}`)},
];

const run = (service: ApplyCharacterService, requirements: Requirement[]): CharacterCheck => {
  const raw = service.raw();
  const context: Context = {
    service, raw, applied: service.applied(), decisions: raw.creation?.decisions || {},
    levels: raw.classLevels || [], inventory: raw.inventory || [],
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const requirement of requirements) {
    const found = requirement.check(context);
    if (!found) continue;
    if (Array.isArray(found)) errors.push(...found);
    else {
      errors.push(...(found.errors || []));
      warnings.push(...(found.warnings || []));
    }
  }
  return {errors, warnings};
};

// the whole character, before the creation ends
export const checkCreatedCharacter = (service: ApplyCharacterService): CharacterCheck => run(service, REQUIREMENTS);

// what one step must leave on the sheet, when it is completed
export const checkCreationStep = (service: ApplyCharacterService, step: string): CharacterCheck =>
  run(service, REQUIREMENTS.filter(r => r.step === step));

// what the app requires of a step, as its guide tells the AI
export const stepRequirements = (step: string): string[] => REQUIREMENTS.filter(r => r.step === step).map(r => r.requires);
