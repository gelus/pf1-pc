import {missingPicks} from '../utils/choices';
import {allowsAlignment} from '../rules/alignments';
import {eidolonWarnings} from '../rules/eidolon.rule';
import {companionWarnings} from '../rules/companions';
import {startingLevelOf, startingWealthOf} from '../rules/starting-wealth';
import {racialTraitProblems} from './page-facts';
import {archetypeWarnings} from '../rules/archetypes';
import {castsSpells} from './spells';
import {AMMUNITION, loadEffects} from './gear-prices';
import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {Feature} from '../interfaces/character.interface';
import {ABILITIES, availableFeats, pendingAbilityIncreases} from '../rules/class-progression';
import {pointBuyTotal} from '../rules/point-buy';
import {Character} from '../utils/character.class';
import {archetypesOf, characterLevel, featureKey} from '../utils/classlevel.class';
import {armorCategoryOf, isArmor, isShield} from '../utils/equipment.util';
import {Item} from '../utils/item.class';
import {purseToCopper} from '../utils/wealth.util';
import {isAttackAdjustment} from './builders';
import {hasOutfit} from './gear-prices';

// what a ranged weapon shoots, by the words its name uses

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

// allowsAlignment is in rules/alignments.ts, where a prestige class's requirements read it too
export {allowsAlignment};

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
    if (budget > 0 && total > budget) return [`the scores cost ${total} points, more than the ${budget}-point buy`];
    return {warnings: budget > 0 && total < budget ? [`${budget - total} of the ${budget} points of the point buy are unspent`] : []};
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
  {step: 'race', requires: 'an alternate racial trait in place of each trait it replaces, none replaced twice', check: ({raw}) =>
    racialTraitProblems(undefined, raw.race?.features || [])},

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
  // a character made above 1st level buys its gear with the wealth of its level instead
  {step: 'class', requires: 'its starting gold', check: ({raw, levels}) =>
    !levels[0] || Number(levels[0].startingWealth) > 0 || startingLevelOf(raw) > 1 ? [] : [`${levels[0].name} has no starting gold`]},
  {step: 'class', requires: 'its weapon and armor proficiencies', check: ({levels, applied}) =>
    !levels[0] || (applied.proficiencies?.weapons || []).length ? []
      : [`${levels[0].name} gives no weapon proficiencies (every class has some: its page's "Weapon and Armor Proficiency")`]},
  {step: 'class', requires: 'a favored class, and the favored class bonus the player picked (+1 hp or +1 skill rank)', check: ({raw, levels}) => {
    const first = levels[0];
    if (!first) return [];
    if (!(raw.favoredClasses || []).length) return ['there is no favored class (usually the first class)'];
    if ((raw.favoredClasses || []).some(c => c.toLowerCase() === String(first.name).toLowerCase()) && !first.favoredClassBonus) {
      return [`${first.name} is the favored class but its level has no favored class bonus (the player's pick: +1 hp, +1 skill rank or an alternate bonus of the race)`];
    }
    // an alternate bonus picked is one of the race's
    const options = raw.race?.favoredClassOptions || [];
    return levels.filter(l => l.favoredClassBonus === 'other').flatMap(l => {
      const option = options.find(o => o.id === l.favoredClassOption);
      if (!option) return [`${l.name} ${l.level} takes an alternate favored class bonus but names none of the race's (add_class_level favored_class_option, or the class level form)`];
      // an option with choices adds nothing until the level picks them (the energy of a resistance)
      const missing = missingPicks(option.choices, l.favoredClassChoices);
      return missing.length ? [`${l.name} ${l.level}'s favored class bonus needs the player's picks (favored_class_choices): ${missing.join('; ')}`] : [];
    });
  }},
  {step: 'class', requires: 'hit points', check: ({levels, applied}) =>
    !levels.length || Number(applied.hp) >= 1 ? [] : ['the character has no hit points']},
  {step: 'class', requires: 'every class feature of the 1st-level row, with its numbers as adjustments or its rules in its description', check: ({levels}) =>
    blankFeatures('class feature', levels.flatMap(l => l.features || []))},

  // a companion's kind (rules/companions.ts): told, never holding the character back
  {step: 'class', requires: 'a companion within what its kind allows (a cohort at least 2 levels below its leader)', check: ({raw, applied}) =>
    ({warnings: [...companionWarnings(raw), ...eidolonWarnings(raw, applied)]})},
  // archetypes (archetypes.ts): no class feature one of them replaced, no feature traded by two
  {step: 'class', requires: 'no class feature an archetype of the class replaced, and no feature two archetypes trade', check: ({levels}) =>
    archetypeWarnings(levels)},
  {step: 'class', requires: 'a class that casts with its spellcasting (how it casts, its table), and the choices its caster needs (a school, domains)', check: ({levels, applied}) => {
    const errors: string[] = [];
    for (const name of [...new Set(levels.map(l => l.name))]) {
      const ofClass = levels.filter(l => l.name === name);
      const info = ofClass.find(l => l.spellcasting)?.spellcasting;
      if (!info) {
        const texts = ofClass.flatMap(l => (l.features || []).flatMap(f => [f.name || '', f.description || '']));
        // a prestige class advancing another class's spellcasting casts with that class
        if (ofClass.some(l => l.advancesCasting?.length)) continue;
        if (castsSpells(texts)) errors.push(`${name} casts spells but has no spellcasting (set_class_spellcasting, from its page)`);
        continue;
      }
      const caster = applied.spells?.[info.origin];
      if (!caster) continue;
      if (info.specialistSchool && !caster.school) errors.push(`${name} specializes in a school: set_caster_choices with the player's school and opposition schools`);
      if (info.domainSlots && !(caster.domains || []).length) errors.push(`${name} picks domains: set_caster_choices with the player's domains`);
    }
    return errors;
  }},

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
    // the feats taken, those features give included (a wizard's Scribe Scroll): what the feat count of the sheet counts
    const feats = (applied.feats || []).length;
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
      ...((raw.traits || []).length > allowed ? [`${raw.traits.length} traits, the character has ${allowed} (a drawback goes in drawbacks, where it allows one more trait: never remove a trait the player picked to fit, ask)`] : []),
      ...blankFeatures('trait', raw.traits || []), ...blankFeatures('drawback', raw.drawbacks || []),
    ];
  }},

  // spells
  {step: 'spells', requires: 'every caster with spells on its list at each level it casts, a caster that counts what it knows knowing its table\'s number, a prepared caster\'s slots prepared', check: ({applied}) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const [origin, caster] of Object.entries(applied.spells || {})) {
      if (!caster?.classTable) continue;
      (caster.spells || []).forEach((level, index) => {
        if (!level || (caster.maxSpellLevel !== undefined && index > caster.maxSpellLevel)) return;
        const slots = level.atWill || level.perDay.total > 0 || (level.known ?? 0) > 0;
        if (!slots) return;
        if (!level.spells.length) errors.push(`${origin} has no level ${index} spells on its list (add_spells)`);
        else if (level.known !== undefined && level.spells.length < level.known) warnings.push(`${origin} knows ${level.spells.length} of the ${level.known} level ${index} spells it can (add_spells)`);
        if (caster.casting === 'prepared' && level.spells.length && !(level.prepared || []).length) warnings.push(`${origin} has nothing prepared at level ${index} (prepare_spells)`);
      });
    }
    return {errors, warnings};
  }},

  // equipment
  {step: 'equipment', requires: 'gear bought within the starting gold', check: ({raw, levels, inventory}) => {
    const errors = inventory.length ? [] : ['the character has no gear'];
    if (levels.length && startingWealthOf(raw) > 0) {
      const left = purseToCopper(new RemainingStartingWealthPipe().transform(raw));
      if (left < 0) errors.push(`the gear costs ${-left / 100} gp more than the starting gold`);
    }
    // a character made above 1st level spends no more than half its wealth on one item (Core Rulebook, chapter 12)
    const half = startingLevelOf(raw) > 1 ? startingWealthOf(raw) / 2 : Infinity;
    const costly = inventory.filter(item => purseToCopper(item.cost) / 100 > half).map(item => item.name);
    return {errors, warnings: costly.length ? [`${costly.join(', ')} ${costly.length > 1 ? 'each cost' : 'costs'} more than half the character's wealth (${half} gp): the Core Rulebook advises against it, the GM may allow it`] : []};
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

  {step: 'equipment', requires: 'the load the gear makes told to the player (a medium or heavy load slows the character and caps its Dex bonus)', check: ({applied}) => {
    if (!applied.load || applied.load === 'light') return [];
    return {warnings: [`the character carries ${applied.carriedWeight} lbs., a ${applied.load} load (light up to ${applied.carryingCapacity.light} lbs.): ${loadEffects(applied.load)}`]};
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

// what a level up must leave right, on top of the creation's requirements of what a new level changes (a class level,
// its skill ranks, feats and spells): the ability increase of a 4th level picked, the hit die rolled for each level
const LEVEL_REQUIREMENTS: Requirement[] = [
  {step: 'level', requires: 'an ability increase picked for every 4th character level', check: ({raw}) => {
    const owed = pendingAbilityIncreases(raw);
    return owed ? [`${owed} ability increase${owed > 1 ? 's are' : ' is'} not picked (choose_ability_increase)`] : [];
  }},
  {step: 'level', requires: 'the hit die rolled for every level after the first', check: ({levels}) =>
    levels.slice(1).filter(l => !(Number(l.rolledHp) >= 1)).map(l => `${l.name} ${l.level} has no hit die roll`)},
];
// the creation's steps whose requirements a level up holds the character to
const LEVEL_UP_CHECKED = ['class', 'skills', 'feats', 'spells'];

// the character once a level up is done. the problems it had before the level up (known) are warnings: they were not
// the level up's, and a character made by hand would otherwise never level up with the AI
export const checkLeveledCharacter = (service: ApplyCharacterService, known: string[] = []): CharacterCheck => {
  const found = run(service, [...REQUIREMENTS.filter(r => LEVEL_UP_CHECKED.includes(r.step)), ...LEVEL_REQUIREMENTS]);
  const before = new Set(known);
  return {
    errors: found.errors.filter(e => !before.has(e)),
    warnings: [...found.errors.filter(e => before.has(e)), ...found.warnings],
  };
};

// the whole character, before the creation ends
export const checkCreatedCharacter = (service: ApplyCharacterService): CharacterCheck => run(service, REQUIREMENTS);

// what one step must leave on the sheet, when it is completed
export const checkCreationStep = (service: ApplyCharacterService, step: string): CharacterCheck =>
  run(service, [...REQUIREMENTS, ...LEVEL_REQUIREMENTS].filter(r => r.step === step));

// what the app requires of a step, as its guide tells the AI
export const stepRequirements = (step: string): string[] => [...REQUIREMENTS, ...LEVEL_REQUIREMENTS].filter(r => r.step === step).map(r => r.requires);
