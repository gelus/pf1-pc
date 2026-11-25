import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {CLASS_PRESETS, classLevelFromPreset} from '../rules/class-presets';
import {
  ABILITIES, SAVES, availableFeats, babFor, saveFor, isAbilityIncreaseLevel, isFavoredClassLevel, pendingAbilityIncreases,
} from '../rules/class-progression';
import {levelUpAvailable, nextLevelXp} from '../rules/experience';
import {BabProgression, ClassLevel, FavoredClassBonus, Proficiencies, SaveName, archetypesOf, characterLevel} from '../utils/classlevel.class';
import {KNOWLEDGE_SPECIALTIES, getSkillList, isSkillFamily, skillAbilityMap} from '../utils/skilllist.class';
import {describe, describeAdjustments, provenance, unchecked} from './builders';
import {parseJsonArg, parseJsonList} from './json-arg';
import {abilityModifier} from '../ability-mod.pipe';
import {bonusFeatGiven, domainProblems, mechanicsProblems, mechanicsRefusal, normalizedFeature, shownOnSheet, toggledWhenActivated, withoutMarks, CLASS_FEATURE_RECIPE} from './mechanics';
import {fromForm, growthProblems, usesAgain, valuesByLevel} from './feature-form';
import {lookedUpUrlFor, pageFactsFor, rulesTextFor} from './rules-lookup';
import {pageFactProblems} from './page-facts';
import {unmetRequirementsOf} from '../rules/prerequisites';
import {classCasters} from '../rules/spellcasting';
import {ActionResult} from './play-actions';
import {alteredFeatures, applyArchetypes, archetypeProblems, archetypesFrom, archetypesOverview, replacedFeatures} from './archetypes';
import {CasterChoices, archetypeCasting, casterChoicesFrom, castsSpells, setCasterChoices, spellcastingFrom} from './spells';
import {ClassSpellcasting, FavoredClassOption} from '../interfaces/character.interface';
import {favoredClassOptionFrom, favoredPicksFrom, findOption, sameOption} from './favored-class';

// leveling the character up with the AI: what the next level needs (get_level_up_status), the class level itself
// with its hit points, favored class bonus, ability increase and class features (add_class_level), skill ranks
// (set_skill_ranks) and an ability increase picked later (choose_ability_increase). the engine works the numbers out
// from the class level entries (bab, saves, hit points: rules/class-progression.ts), these only fill them in, each
// one step of the undo history

const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const classesOf = (levels: ClassLevel[]) => {
  const counts = new Map<string, number>();
  for (const entry of levels) counts.set(entry.name || 'unnamed', (counts.get(entry.name || 'unnamed') || 0) + 1);
  return [...counts].map(([name, levels]) => ({name, levels}));
};

// the character levels owed an ability increase that has not been picked
const owedIncreases = (levels: ClassLevel[]): number[] => levels
  .map((entry, index) => ({entry, level: index + 1}))
  .filter(({entry, level}) => isAbilityIncreaseLevel(level) && !ABILITIES.includes(lower(entry.abilityIncrease)))
  .map(({level}) => level);

export const levelUpStatus = (service: ApplyCharacterService): object => {
  const raw = service.raw();
  const applied = service.applied();
  const levels = raw.classLevels || [];
  const ranks = skillRankBudget(applied);
  const level = characterLevel(raw);
  return {
    level,
    classes: classesOf(levels),
    experience: raw.experience || 0,
    nextLevelAt: nextLevelXp(raw) ?? 'the highest level',
    levelUpAvailable: levelUpAvailable(raw),
    favoredClasses: raw.favoredClasses || [],
    // the bonus a favored class level gives: +1 hp, +1 skill rank, or an alternate one of the race (its page)
    favoredClassBonusChoices: ['hp', 'skill', ...((raw.race?.favoredClassOptions || []).length
      ? (raw.race!.favoredClassOptions!).map(o => `other: ${o.class}: ${o.name || o.description}`
        + (o.choices?.length ? ` (favored_class_choices: ${o.choices.map(c => `${c.id}, ${c.label}${c.options ? `: ${c.options.join('/')}` : ''}`).join('; ')})` : ''))
      : ['other: an alternate bonus the race\'s page lists for the class (favored_class_option)'])],
    hitPoints: {max: applied.hp, conModifier: Math.floor(((applied.abilityScores?.con ?? 10) - 10) / 2)},
    abilityIncreasesOwed: owedIncreases(levels),
    // what each class's archetypes trade away: a later level leaves those class features out
    ...(archetypesOverview(levels) ? {archetypes: archetypesOverview(levels)} : {}),
    feats: {taken: (applied.feats || []).length, allowed: availableFeats(applied)},
    skillRanks: {left: ranks.available - ranks.spent, total: ranks.available, maxPerSkill: Math.max(1, level)},
    coreClasses: CLASS_PRESETS.map(p => p.name),
    nextLevel: level + 1,
    nextLevelGets: [
      'a class level (its hit die, skill ranks, bab and saves come with it)',
      ...((level + 1) % 2 === 1 ? ['a feat'] : []),
      ...(isAbilityIncreaseLevel(level + 1) ? ['+1 to an ability score'] : []),
    ],
    // a level up builds the class features of the new row (a creation's class step has this in its guide)
    ...(raw.creation || !level ? {} : {howToWriteClassFeatures: CLASS_FEATURE_RECIPE}),
  };
};

const featuresOf = (value: unknown): {features?: Feature[], error?: string} => {
  if (lower(value) === 'none') return {features: []};
  const read = parseJsonList(value, 'features');
  if (read.error) return {error: read.error};
  if (read.value === undefined) return {features: []};
  const list = Array.isArray(read.value) ? read.value : [read.value];
  // adjustments left out are none (a new Feature would start with an example one)
  return {features: list.map((f: any) => {
    const written = normalizedFeature(f) ?? {};
    return new Feature({...written, description: written.description ?? '', adjustments: written.adjustments ?? {}});
  })};
};

// the uses a day a 1st-level feature's text works out from an ability ("3 + her Wisdom modifier"), from the sheet's
// scores rather than the AI's sum (it took Rebuke Death's from the Wisdom before the race's +2). later levels add
// more (rage's 2 rounds a level), so only the 1st level is worked out. what was put right, for the AI
const ABILITY_KEYS: {[word: string]: string} = {strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha'};
const USES_FROM = /(\d+)\s*\+\s*(?:(?:her|his|their|its|your|the [\w-]+'s)\s+)?(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\b(?:\s+modifier|\s+mod\b)?/i;
const usesWorkedOut = (feature: Feature, applied: unknown): string | undefined => {
  // uses filled in by level (uses_by_level) are the app's own already
  if ((feature as {usesByLevel?: unknown}).usesByLevel) return undefined;
  const holders = [feature, ...Object.values(feature.adjustments || {}).filter((v: any) => v && typeof v === 'object' && v.charges)] as Feature[];
  for (const holder of holders) {
    if (!holder.charges) continue;
    const from = USES_FROM.exec(`${holder.description || ''} ${feature.description || ''}`);
    if (!from) continue;
    const word = from[2].toLowerCase();
    const ability = ABILITY_KEYS[word] ?? word;
    const total = Math.max(1, Number(from[1]) + abilityModifier(applied, ability));
    if (total === holder.charges.total) continue;
    const was = holder.charges.total;
    holder.charges = {...holder.charges, total, current: total};
    return `${holder.name || feature.name}: ${total} ${holder.charges.label || 'uses'} (${from[1]} + ${ability} modifier), not ${was}`;
  }
  return undefined;
};

// the proficiencies a class's page lists, as the AI gives them: "simple, martial, hand crossbow" and "light, medium,
// shield". undefined while either is missing ("none" is none)
const ARMOR_NAMES: {[said: string]: string} = {
  light: 'light', 'light armor': 'light', medium: 'medium', 'medium armor': 'medium', heavy: 'heavy', 'heavy armor': 'heavy',
  shield: 'shield', shields: 'shield', 'tower shield': 'tower shield', 'tower shields': 'tower shield',
};
const proficienciesOf = (args: {[name: string]: unknown}): Proficiencies | undefined => {
  const list = (value: unknown): string[] | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const words = (Array.isArray(value) ? value.map(String) : String(value).split(/,|\band\b/)).map(w => w.trim().toLowerCase())
      .map(w => w.replace(/\s+weapons?$/, '').replace(/^(all|any)\s+/, '').replace(/\s*\(.*\)$/, '')).filter(Boolean);
    return words.some(w => w === 'none') ? [] : [...new Set(words)];
  };
  const weapons = list(args['weapon_proficiencies']);
  const armor = list(args['armor_proficiencies'])?.map(a => ARMOR_NAMES[a] ?? ARMOR_NAMES[a.replace(/s$/, '')] ?? a);
  return weapons && armor ? {weapons, armor: [...new Set(armor)]} : undefined;
};

// the formulas of the class level a feature has, with their values by level ("Track skills.survival.value[follow
// tracks]: max(1, floor({level.slayer}/2)) (1st 1, 5th 2, ...)"), for the AI to hold against the class table
const writtenFormulas = (feature: Feature, className: string): string[] => {
  const own = (feature.adjustments || {}) as {[path: string]: unknown};
  const holders = [own, ...Object.values(own).map((v: any) => v && typeof v === 'object' && !Array.isArray(v) ? v.adjustments : undefined).filter(Boolean)];
  return holders.flatMap(h => Object.entries(h as object).flatMap(([path, value]) => {
    const formula = value && typeof value === 'object' && 'value' in value ? (value as any).value : value;
    const shown = valuesByLevel(formula, className, [1, 2, 3, 4, 5, 10, 15, 20]);
    return shown ? [`${feature.name} ${path}: ${formula} (${shown})`] : [];
  }));
};

// the bab and saves a class level gives (its class's own, at that level of it), held against the class table's row
// for that level: a progression the AI picked wrong shows here, with the one that fits
const PROGRESSIONS: BabProgression[] = ['full', 'threeQuarters', 'half'];
const tableRowProblems = (entry: ClassLevel, value: unknown): {problems: string[], notes: string[]} => {
  const read = parseJsonArg(value, 'table_row');
  const row = read.value && typeof read.value === 'object' ? read.value as {[key: string]: unknown} : undefined;
  if (read.error || !row) return {problems: [`table_row is the class table's row for level ${entry.level}: {"bab": 1, "fort": 2, "ref": 2, "will": 0}`], notes: []};
  const number = (key: string): number | undefined => {
    const n = Number(String(row[key] ?? row[key.toUpperCase()] ?? '').replace(/^\+/, '').split('/')[0]);
    return Number.isFinite(n) && String(row[key] ?? row[key.toUpperCase()] ?? '').trim() !== '' ? n : undefined;
  };
  const problems: string[] = [];
  const notes: string[] = [];
  const bab = number('bab');
  if (bab !== undefined && entry.babProgression && babFor(entry.babProgression, entry.level) !== bab) {
    // the one progression that gives the table's bonus is the class's; more than one, and the AI says which
    const fits = PROGRESSIONS.filter(p => babFor(p, entry.level) === bab);
    if (fits.length === 1) {
      notes.push(`bab is "${fits[0]}", not "${entry.babProgression}": the class table gives +${bab} at level ${entry.level}`);
      entry.babProgression = fits[0];
    } else {
      problems.push(`bab: the class table gives +${bab} at level ${entry.level}, ${entry.babProgression} gives +${babFor(entry.babProgression, entry.level)}${fits.length ? `: it is ${fits.map(f => `"${f}"`).join(' or ')} (see a later row)` : ''}`);
    }
  }
  for (const save of SAVES) {
    const listed = number(save);
    if (listed === undefined) continue;
    const good = (entry.goodSaves || []).includes(save);
    if (saveFor(good, entry.level, entry.prestige) === listed) continue;
    if (saveFor(!good, entry.level, entry.prestige) === listed) {
      notes.push(`${save} is a ${good ? 'poor' : 'good'} save: the class table gives +${listed} at level ${entry.level}`);
      entry.goodSaves = good ? (entry.goodSaves || []).filter(s => s !== save) : [...(entry.goodSaves || []), save];
    } else {
      problems.push(`the class table gives ${save} +${listed} at level ${entry.level}, which neither a good save (+${saveFor(true, entry.level, entry.prestige)}) nor a poor one (+${saveFor(false, entry.level, entry.prestige)}) gives: ${entry.prestige ? 'read the row again' : 'read the row again (a prestige class gives prestige: true, its good saves start at +1)'}`);
    }
  }
  return {problems, notes};
};

// the rules of a class option a feature is (a school, a domain, a mystery, a curse), from the page it was looked up on
// rather than the class page: Evocation School was checked against the wizard page alone, and its Force Missile went
// without its uses a day. the name as written, the choice in its parentheses, or the name without its kind's word
const OPTION_WORDS = /\b(arcane|school|domain|bloodline|mystery|curse|revelation|hex|discovery|talent|order|totem|oracle's)\b/gi;
const optionRules = (name: string): string | undefined => {
  const inner = /\(([^)]+)\)/.exec(name)?.[1]?.trim();
  const bare = name.replace(/\(.*?\)/g, '').replace(OPTION_WORDS, '').replace(/[:\s]+/g, ' ').trim();
  for (const candidate of [name, inner, bare].filter((c): c is string => !!c)) {
    const url = lookedUpUrlFor(candidate);
    if (!url) continue;
    // its own lines on a list page (a curse among curses), all of a page of its own (a school's)
    const rules = rulesTextFor(url, candidate) ?? (/Display\.aspx/i.test(url) ? rulesTextFor(url, candidate, true) : undefined);
    if (rules) return rules;
  }
  return undefined;
};

// a class feature that adds a fixed number to its own class's caster level, concentration or spells per day, when its
// text gives no such number: the class's levels give those already (rules/spellcasting.ts), so it counts them twice
// (a wizard's "Spellcasting" feature gave +1 caster level: CL 2 at 1st level)
const CASTER_NUMBERS = /^spells\.([^.\[]+)\.(casterLevel|concentration|spells\.\d+\.perDay\.(total|current))(\[|$)/i;
const ownCasterNumbers = (features: Feature[], info: ClassSpellcasting): string[] => features.flatMap(feature => {
  const own = Object.keys(feature.adjustments || {}).filter(path => {
    const match = CASTER_NUMBERS.exec(path);
    return !!match && !path.includes('[') && (lower(match[1]) === lower(info.origin) || match[1] === '*');
  });
  if (!own.length) return [];
  const text = `${feature.description || ''} ${(feature as {rulesText?: unknown}).rulesText ?? ''}`;
  if (/(\+\s?\d+|\b(increases?|bonus))[^.]{0,30}\b(caster level|concentration|spells? per day)|\b(caster level|concentration)[^.]{0,20}\+\s?\d+|\b(additional|extra) spells?\b/i.test(text)) return [];
  return [`${feature.name || 'a feature'}: ${own.join(', ')} come from the class's levels already (its caster level and spells per day are worked out from them): leave them out, unless its text gives a bonus to them`];
});

// the caster of a class as the sheet works it out, for the AI: what it casts at each level and what it has
const casterNow = (service: ApplyCharacterService, origin: string): object | undefined => {
  const caster = service.applied().spells?.[origin];
  if (!caster) return undefined;
  return {
    casterLevel: caster.casterLevel, casting: caster.casting, ability: caster.ability,
    ...(caster.school ? {school: caster.school} : {}), ...(caster.oppositionSchools?.length ? {opposition: caster.oppositionSchools} : {}),
    ...(caster.domains?.length ? {domains: caster.domains} : {}),
    levels: (caster.spells || []).map((level, index) => level ? `${index}: ${level.atWill ? 'at will' : `${level.perDay.total} a day`}${level.extraSlot ? ` + ${level.extraSlot.label}` : ''}${level.known !== undefined ? `, knows ${level.spells.length} of ${level.known}` : ''}, ${level.spells.length} on its list` : undefined).filter(Boolean),
  };
};

// what a caster still needs once its class level is in: the spells it knows (a spontaneous caster's count) or keeps
export const spellsToDo = (service: ApplyCharacterService, origin: string): string[] => {
  const caster = service.applied().spells?.[origin];
  if (!caster) return [];
  const short = (caster.spells || []).map((level, index) => {
    if (!level) return undefined;
    if (level.known !== undefined && level.spells.length < level.known) return `${level.known - level.spells.length} level ${index}`;
    if (level.known === undefined && !level.spells.length && (level.perDay.total > 0 || level.atWill)) return `level ${index}`;
    return undefined;
  }).filter(Boolean);
  return short.length ? [`${origin} spells to add: ${short.join(', ')} (look them up, add_spells${caster.casting === 'prepared' ? ', then prepare_spells' : ''})`] : [];
};

export const addClassLevel = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const raw = service.raw();
  const levels = raw.classLevels || [];
  const className = text(args['class_name']);
  if (!className) return {error: 'class_name is the class the level is in'};
  // what is missing to build the level at all: refused with everything else the call gets wrong
  const early: string[] = [];
  const newCharacterLevel = levels.length + 1;
  const ofClass = levels.filter(entry => lower(entry.name) === lower(className));
  const preset = CLASS_PRESETS.find(p => lower(p.name) === lower(className));

  // the new entry: the next level of a class the character has (its progression copied), a core class from its
  // preset, or a class the AI describes
  let entry: ClassLevel;
  if (ofClass.length) {
    const last = ofClass[ofClass.length - 1];
    entry = new ClassLevel({
      name: last.name, level: ofClass.length + 1, hitDice: last.hitDice, rolledHp: 0, skillRanks: last.skillRanks,
      startingWealth: 0, classSkills: [...(last.classSkills || [])], babProgression: last.babProgression,
      goodSaves: last.goodSaves ? [...last.goodSaves] : undefined, favoredClassBonus: last.favoredClassBonus,
      ...(last.prestige ? {prestige: true} : {}),
      ...(last.spellcasting ? {spellcasting: JSON.parse(JSON.stringify(last.spellcasting))} : {}),
      features: [],
    });
  } else if (preset) {
    entry = classLevelFromPreset(preset, 1, newCharacterLevel === 1);
  } else {
    const hitDie = Math.floor(Number(args['hit_die']));
    const bab = text(args['bab']) as BabProgression;
    const goodSaves = (Array.isArray(args['good_saves']) ? args['good_saves'] : String(args['good_saves'] ?? '').split(','))
      .map(lower).filter(Boolean) as SaveName[];
    const skillRanks = Math.floor(Number(args['skill_ranks']));
    const classSkills = (Array.isArray(args['class_skills']) ? args['class_skills'] : String(args['class_skills'] ?? '').split(','))
      .map(lower).filter(Boolean);
    const startingGold = Number(args['starting_gold']);
    const proficiencies = proficienciesOf(args);
    const missing = [
      ...([6, 8, 10, 12].includes(hitDie) ? [] : ['hit_die (6, 8, 10 or 12)']),
      // the first level of the character brings the starting wealth gear is bought from
      ...(newCharacterLevel > 1 || startingGold > 0 ? [] : ['starting_gold (the average starting wealth of its page, in gp)']),
      ...(['full', 'threeQuarters', 'half'].includes(bab) ? [] : ['bab (full, threeQuarters or half)']),
      ...(goodSaves.every(s => SAVES.includes(s)) ? [] : ['good_saves (fort, ref, will)']),
      ...(skillRanks > 0 ? [] : ['skill_ranks']),
      // the class's first level brings its proficiencies (a slayer went without any)
      ...(proficiencies ? [] : ['weapon_proficiencies and armor_proficiencies (its page\'s "Weapon and Armor Proficiency": "simple, martial" and "light, medium, shield", "none" for none)']),
      // its table's row, which its bab and saves must give (a slayer's full bab went in as three quarters)
      ...(args['table_row'] !== undefined && args['table_row'] !== '' ? [] : ['table_row (the class table\'s 1st row: {"bab": 1, "fort": 2, "ref": 2, "will": 0})']),
    ];
    // what was given, held against the facts its page was read to give (page-facts.ts)
    early.push(...pageFactProblems(pageFactsFor(text(args['source_url']), className), {
      hitDie: [6, 8, 10, 12].includes(hitDie) ? hitDie : undefined, skillRanks: skillRanks > 0 ? skillRanks : undefined,
      startingGold: newCharacterLevel === 1 && startingGold > 0 ? startingGold : undefined,
      classSkills: classSkills.length ? classSkills : undefined, proficiencies,
    }));
    // told with every other problem of the call, the level checked as far as it goes without them
    if (missing.length) early.push(`${className} is not a core class the app knows (${CLASS_PRESETS.map(p => p.name).join(', ')}): from its class page give ${missing.join(', ')}`);
    entry = new ClassLevel({
      name: className, level: 1, hitDice: [6, 8, 10, 12].includes(hitDie) ? hitDie : 10, rolledHp: 0, skillRanks,
      classSkills, babProgression: ['full', 'threeQuarters', 'half'].includes(bab) ? bab : 'full', goodSaves,
      startingWealth: newCharacterLevel === 1 ? startingGold : 0, features: [], proficiencies,
      ...(args['prestige'] === true ? {prestige: true} : {}),
      // the alignments its page allows, when it limits them (checked against the character's)
      ...(text(args['alignment']) && !/^any$/i.test(text(args['alignment'])) ? {alignment: text(args['alignment'])} : {}),
    });
  }

  // hit points: the first character level gets the full hit die, later ones what the player rolled
  if (newCharacterLevel > 1) {
    const rolled = Math.floor(Number(args['rolled_hp']));
    if (!(rolled >= 1 && rolled <= entry.hitDice)) {
      early.push(`rolled_hp is the d${entry.hitDice} the player rolled for this level (1 to ${entry.hitDice}), ask for it (or whether they take the average, ${Math.floor(entry.hitDice / 2) + 1}, if the table allows it)`);
    } else entry.rolledHp = rolled;
  }

  // everything wrong at once: one more call fixes all of it
  const problems: string[] = [...early];
  const notes: string[] = [];
  // the first level of a character with no favored class yet: the class taken is the favored one
  let favoredClasses: string[] | undefined;
  const favored = text(args['favored_class_bonus']) as FavoredClassBonus;
  // the race's alternate bonus picked for 'other': one of its options, or one read from the race page, kept on the race
  let newOption: FavoredClassOption | undefined;
  if (favored === 'other') {
    const options = raw.race?.favoredClassOptions || [];
    const said = args['favored_class_option'];
    const named = typeof said === 'string' && !said.trim().startsWith('{') ? said : '';
    const found = said === undefined || said === '' || named ? findOption(options, entry.name, named) : undefined;
    if (found) entry.favoredClassOption = found.id;
    else if (said !== undefined && said !== '' && !named) {
      const read = favoredClassOptionFrom(said, entry.name);
      problems.push(...read.problems);
      if (read.option) {
        newOption = options.find(o => sameOption(o, read.option!)) ?? read.option;
        entry.favoredClassOption = newOption.id;
        if (options.includes(newOption)) newOption = undefined;
      }
    } else {
      const forClass = options.filter(o => o.class.trim().toLowerCase() === entry.name.trim().toLowerCase());
      problems.push(`favored_class_bonus other: give favored_class_option, the alternate bonus the player picked from the race's page for ${entry.name}`
        + (forClass.length ? ` (the race has: ${forClass.map(o => o.name || o.description).join('; ')})` : ', as {"description": "...", "adjustments": {...what one pick adds, "1/4" for +1/4}}'));
    }
    // the picks of the option's choices on this level (the energy of a resistance)
    const picked = entry.favoredClassOption ? [...options, ...(newOption ? [newOption] : [])].find(o => o.id === entry.favoredClassOption) : undefined;
    if (picked) {
      const read = favoredPicksFrom(picked, args['favored_class_choices']);
      problems.push(...read.problems);
      if (read.picks) entry.favoredClassChoices = read.picks;
    }
}
  // the first level of a character with no favored class: its bonus is the player's pick and comes with the level
  // (left out, the level could not be changed and the AI undid the whole class to add it again)
  if (!favored && raw.creation && newCharacterLevel === 1 && !(raw.favoredClasses || []).length) {
    problems.push(`favored_class_bonus: the 1st level makes ${entry.name} the favored class, give the bonus the player picked for it (hp, skill, or other with favored_class_option)`);
  }
  if (favored) {
    if (!['hp', 'skill', 'other'].includes(favored)) problems.push('favored_class_bonus is hp, skill or other');
    else if (!isFavoredClassLevel(raw, entry)) {
      if (newCharacterLevel === 1 && !(raw.favoredClasses || []).length) {
        favoredClasses = [entry.name];
        notes.push(`${entry.name} is the favored class now`);
        entry.favoredClassBonus = favored;
      } else {
        problems.push(`${entry.name} is not a favored class of the character (${(raw.favoredClasses || []).join(', ') || 'none'}): set it with set_character_details first, or leave favored_class_bonus out`);
      }
    } else entry.favoredClassBonus = favored;
  }

  // an increase given at a level that gets none is left out, not refused
  const increase = lower(args['ability_increase']);
  if (increase) {
    if (!isAbilityIncreaseLevel(newCharacterLevel)) notes.push(`level ${newCharacterLevel} gives no ability increase (every 4th level does), ability_increase was left out`);
    else if (!ABILITIES.includes(increase)) problems.push(`ability_increase is one of ${ABILITIES.join(', ')}`);
    else entry.abilityIncrease = increase;
  }

  // the archetypes taken at this level, and those the class has: what they trade is not gained (archetypes.ts)
  const newArchetypes = archetypesFrom(args['archetypes'], entry.name);
  problems.push(...newArchetypes.problems, ...archetypeProblems(levels, entry, newArchetypes.archetypes));
  const archetypes = [...archetypesOf(levels, entry.name), ...newArchetypes.archetypes];
  // how the class casts: a core class's preset has it, any other class gives it from its page (an oracle went
  // without spells: its slots, spells known and DCs come from this). a class that has it keeps it
  const spellcastingGiven = args['spellcasting'] !== undefined && args['spellcasting'] !== '' && args['spellcasting'] !== null
    && lower(args['spellcasting']) !== 'none';
  if (spellcastingGiven && !entry.spellcasting) {
    const read = spellcastingFrom(args['spellcasting'], entry.name, entry.level);
    problems.push(...read.problems);
    notes.push(...read.notes);
    if (read.spellcasting) {
      entry.spellcasting = read.spellcasting;
      // every level of the class carries it, so the class stays a caster whichever entry is removed
      for (const earlier of ofClass) earlier.spellcasting ??= JSON.parse(JSON.stringify(read.spellcasting));
    }
  } else if (spellcastingGiven && entry.spellcasting) {
    notes.push(`${entry.name} casts as it did already (its ${preset ? 'preset' : 'earlier levels'}): spellcasting was left out`);
  }

  // an archetype that changes how the class casts (another ability, one fewer spell a day, none at all): the class's
  // spellcasting with its changes, the class's from now on
  const casting = archetypeCasting(entry.spellcasting, newArchetypes.archetypes, entry.name, entry.level);
  problems.push(...casting.problems);
  notes.push(...casting.notes);
  if (casting.spellcasting !== undefined) entry.spellcasting = casting.spellcasting ?? undefined;
  // a prestige class: its requirements, met before its first level is taken (the page as read stands over the AI's)
  const requirements = (pageFactsFor(text(args['source_url']), entry.name)?.['requirements'] ?? text(args['requirements'])).trim();
  if (entry.level === 1 && requirements && !/^none\b/i.test(requirements)) {
    const unmet = unmetRequirementsOf(service.applied(), requirements);
    if (unmet.length) problems.push(`the character does not meet the requirements of ${entry.name} (${requirements}): ${unmet.join('; ')}. Tell the player, and suggest what would qualify it`);
    else entry.requirements = requirements;
  }
  // "+1 level of existing spellcasting class": the classes this level advances, casters of the character
  const advances = (Array.isArray(args['advances_casting']) ? args['advances_casting'].map(String) : text(args['advances_casting']).split(','))
    .map(c => c.trim()).filter(c => c && !/^none$/i.test(c));
  if (advances.length) {
    const casters = classCasters(service.raw()).map(c => c.group.name);
    const named = advances.map(a => casters.find(c => c.toLowerCase() === a.toLowerCase()) ?? a);
    const unknown = named.filter(a => !casters.includes(a));
    if (unknown.length) problems.push(`advances_casting names ${unknown.join(', ')}, which the character casts with no class of: its spellcasting classes are ${casters.join(', ') || 'none'}`);
    else entry.advancesCasting = named;
  }
  // the class table's row the AI read, against the bab and saves this level gives
  if (args['table_row'] !== undefined && args['table_row'] !== '') {
    const row = tableRowProblems(entry, args['table_row']);
    problems.push(...row.problems);
    notes.push(...row.notes);
  }
  const given = featuresOf(args['features']);
  if (given.error) {
    problems.push(given.error);
    given.features = [];
  }
  // the form each feature was filled in with from the class page: its numbers by level made formulas, its uses a day
  // worked out for this level, its level checked against this one (sneak attack came at 1st)
  const level = `{level.${entry.name.trim().toLowerCase()}}`;
  const growth: string[] = [];
  for (const feature of given.features!) {
    const form = fromForm(feature, {level, className: entry.name, classLevel: entry.level, applied: service.applied()});
    problems.push(...form.problems);
    growth.push(...form.wrote);
    const gained = Number((feature as {gained_at?: unknown}).gained_at);
    if (!Number.isInteger(gained) || gained < 1) {
      problems.push(`${feature.name || 'a feature'}: gained_at is the level of the class table row it is in (${entry.level} for this level's)`);
    } else if (gained !== entry.level) {
      problems.push(`${feature.name || 'a feature'} is gained at ${entry.name} ${gained}, not ${entry.level}: ${gained > entry.level ? 'add it at that level' : `it came with that level, leave it out. add_class_level always adds the next level (${entry.name} ${entry.level}): to change ${entry.name} ${gained} use set_favored_class_bonus, edit_feature or undo_last_change`}`);
    }
    delete (feature as {gained_at?: unknown}).gained_at;
  }
  // one the player switches on (studied target, rage) shows as its entry with the toggle, whatever the AI wrote
  // and one the player uses (channel energy) shows as its entry, with its uses a day, even with no number to adjust
  problems.push(...replacedFeatures(archetypes, given.features!));
  notes.push(...alteredFeatures(archetypes, given.features!));
  given.features = given.features!.map(toggledWhenActivated).map(shownOnSheet).map(bonusFeatGiven);
  if (entry.level === 1) {
    for (const feature of given.features!) {
      const fixed = usesWorkedOut(feature, service.applied());
      if (fixed) notes.push(fixed);
    }
  }
  const features = withoutMarks(given.features!);
  // a class gives class features at its first level (its table's Special column): none means they were left out
  if (!features.length && entry.level === 1 && lower(args['features']) !== 'none') {
    problems.push(`the 1st level of ${entry.name} gives class features (its table's Special column, the class page): write each with its adjustments. Only if its table gives none, pass features "none"`);
  }
  // where the class features come from, as for create_feature: the class page, the player, or memory
  const source = features.length ? provenance(args, entry.name) : undefined;
  if (source?.error) problems.push(source.error);
  for (const feature of features) {
    if (source?.basedOn) feature.description = describe(feature.description || '', source.basedOn, source.sourceUrl);
  }
  const invalid = features.flatMap((f, i) => validateFeature(JSON.parse(JSON.stringify(f)), {reference: service.applied()}, `${f.name || 'feature'} [${i}]`));
  if (hasErrors(invalid)) problems.push(...formatProblems(invalid.filter(p => p.severity !== 'warning')).split('\n').filter(Boolean));
  // the rules the class page gave each feature, checked with its own description (dropped from both, a bonus went
  // unseen), never stored
  const pageUrl = text(args['source_url']);
  for (const feature of given.features!) {
    // an archetype's feature is on the archetype's page
    const rules = rulesTextFor(pageUrl, feature.name || '') ?? optionRules(feature.name || '')
      ?? archetypes.map(a => rulesTextFor(a.sourceUrl, feature.name || '')).find(Boolean);
    if (rules) (feature as {rulesText?: string}).rulesText = rules;
  }
  // the class features' rules as adjustments, shown on the sheet, toggled where the player sees them
  problems.push(...mechanicsProblems(given.features!, {classFeatures: true}));
  // a class whose features say it casts needs its spellcasting, else its spells stay text
  const featureTexts = given.features!.flatMap(f => [f.name || '', f.description || '', String((f as {rulesText?: unknown}).rulesText ?? '')]);
  // a prestige class's "+1 level of existing spellcasting class" is no spellcasting of its own
  const advancesAnother = !!entry.advancesCasting?.length || ofClass.some(l => l.advancesCasting?.length);
  if (!entry.spellcasting && castsSpells(featureTexts) && !advancesAnother) {
    problems.push(`${entry.name} casts spells (its features say so): give "spellcasting" from its page, {"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"} when its spells per day and known are a core class's (bard, cleric, druid, paladin, ranger, sorcerer, wizard), else its own table as "spells_per_day" (and "spells_known") rows by class level, every level of the class: {"1": ["-", 1], "2": ["-", 2]}`);
  }
  if (entry.spellcasting) problems.push(...ownCasterNumbers(given.features!, entry.spellcasting));
  // the choices of its caster: a specialist's school, a domain caster's domains, once, at the class's first level
  let choices: CasterChoices = {};
  if (entry.spellcasting && (entry.spellcasting.specialistSchool || entry.spellcasting.domainSlots)) {
    const have = raw.spells?.[entry.spellcasting.origin] ?? {};
    const read = casterChoicesFrom(args, entry.spellcasting, have);
    problems.push(...read.problems);
    choices = read.choices;
  }
  for (const feature of given.features!) delete (feature as {rulesText?: string}).rulesText;
  // a number its text says grows, written fixed
  problems.push(...given.features!.flatMap(growthProblems));
  if (entry.level === 1) problems.push(...domainProblems(given.features!));
  if (problems.length) return {...mechanicsRefusal(problems), error: 'nothing was changed: fix every one of these, all in one call'};
  entry.features = features;
  const archetyped = applyArchetypes(entry, ofClass, newArchetypes.archetypes, casting.spellcasting);
  // every formula as the features keep it (after a switched-on feature's variants became its plain bonuses), by
  // level, with the uses the form worked out
  const byLevel = [...growth.filter(line => / a (day|encounter|none) at level /.test(line)), ...features.flatMap(f => writtenFormulas(f, entry.name))];
  // a new level of a class works out again the uses of its features (rage's rounds)
  const sameClass = levels.filter(l => lower(l.name) === lower(entry.name)).flatMap(l => l.features || []);

  const before = service.applied();
  const was = {hp: before.hp, bab: before.bab, fort: before.saves.fort, ref: before.saves.ref, will: before.saves.will};
  const label = `level ${newCharacterLevel}: ${entry.name} ${entry.level}`;
  return service.labelled(label, () => {
    service.update({
      classLevels: [...levels.map(l => archetyped.get(l) ?? l), entry], ...(favoredClasses ? {favoredClasses} : {}),
      ...(newOption ? {race: {...raw.race, favoredClassOptions: [...(raw.race?.favoredClassOptions || []), newOption]}} : {}),
    });
    if (entry.spellcasting && Object.keys(choices).length) setCasterChoices(service, entry.spellcasting.origin, choices);
    const usesNow = usesAgain(sameClass, entry.level, service.applied());
    if (usesNow.length) service.update();
    notes.push(...usesNow);
    const after = service.applied();
    const ranks = skillRankBudget(after);
    const owed = owedIncreases(service.raw().classLevels || []);
    const featsOwed = availableFeats(after) - (after.feats || []).length;
    return {
      done: `level ${newCharacterLevel}: ${entry.name} ${entry.level}${newArchetypes.archetypes.length ? ` (${newArchetypes.archetypes.map(a => a.name).join(', ')})` : ''}${features.length ? ` with ${features.map(f => f.name).join(', ')}${unchecked(source!.basedOn!)}` : ''}`,
      ...(notes.length ? {notes} : {}),
      ...(byLevel.length ? {byLevel, checkByLevel: 'the app wrote these from your tables: check each against the class table, and fix a wrong one with edit_feature grows'} : {}),
      now: {hp: `${was.hp} -> ${after.hp}`, bab: `${was.bab} -> ${after.bab}`, saves: `fort ${was.fort} -> ${after.saves.fort}, ref ${was.ref} -> ${after.saves.ref}, will ${was.will} -> ${after.saves.will}`},
      ...(features.length ? {classFeatures: features.map(f => `${f.name}: ${describeAdjustments(f.adjustments) || 'description only'}`)} : {}),
      ...(entry.spellcasting ? {spells: casterNow(service, entry.spellcasting.origin)} : {}),
      stillToDo: [
        ...(ranks.available - ranks.spent > 0 ? [`${ranks.available - ranks.spent} skill ranks to spend (set_skill_ranks)`] : []),
        ...(featsOwed > 0 ? [`${featsOwed} feat${featsOwed > 1 ? 's' : ''} to pick (look it up, create_feature in feats)`] : []),
        ...(owed.length ? [`an ability increase for level ${owed.join(', ')} (choose_ability_increase)`] : []),
        ...(entry.spellcasting ? spellsToDo(service, entry.spellcasting.origin) : []),
        'class features whose numbers are fixed rather than a formula of the class level (uses a day, sneak attack dice) are changed with edit_feature as they grow',
      ],
    };
  });
};

// a skill by the name the player uses: acrobatics, knowledge (arcana), perform (oratory)
const skillKey = (name: string): {key: string, sub?: string} | undefined => {
  const n = lower(name).replace(/\s+/g, ' ');
  const family = /^(\w+) \((.+)\)$/.exec(n);
  const skills = Object.keys(getSkillList());
  if (family && isSkillFamily(family[1])) {
    const sub = family[1] === 'knowledge'
      ? KNOWLEDGE_SPECIALTIES.find(spec => spec.toLowerCase() === family[2] || spec.toLowerCase().startsWith(family[2]))
      : family[2];
    return sub ? {key: family[1], sub} : undefined;
  }
  return skills.includes(n) && !isSkillFamily(n) ? {key: n} : undefined;
};

export const setSkillRanks = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const read = parseJsonList(args['ranks'], 'ranks');
  if (read.error) return {error: read.error};
  const wanted: {[skill: string]: unknown} = read.value && typeof read.value === 'object' ? read.value : {};
  if (!Object.keys(wanted).length) return {error: 'ranks is a JSON object of skills and the ranks each should have, {"climb": 2}'};

  const raw = service.raw();
  const max = Math.max(1, characterLevel(raw));
  const changes: {key: string, sub?: string, name: string, ranks: number}[] = [];
  for (const [name, value] of Object.entries(wanted)) {
    const found = skillKey(name);
    if (!found) return {error: `there is no skill "${name}"${/^(craft|knowledge|perform|profession)$/i.test(name.trim()) ? `, name the specialty: ${name.trim()} (...)` : ''}`};
    const ranks = Math.floor(Number(value));
    if (!(ranks >= 0)) return {error: `the ranks of ${name} are a whole number, 0 or more`};
    if (ranks > max) return {error: `${name} can have ${max} rank${max > 1 ? 's' : ''} at most, one per character level`};
    changes.push({...found, name, ranks});
  }

  // the budget once the ranks are set, worked out on a copy
  const copy = JSON.parse(JSON.stringify(service.applied()));
  for (const {key, sub, ranks} of changes) {
    copy.skills[key] ??= {name: key, ranks: 0, value: 0, classSkill: false, baseAbility: skillAbilityMap[key] || 'int', ...(sub ? {subSkills: {}} : {})};
    if (sub) {
      copy.skills[key].subSkills ??= {};
      copy.skills[key].subSkills[sub] ??= {name: sub, ranks: 0};
      copy.skills[key].subSkills[sub].ranks = ranks;
    } else copy.skills[key].ranks = ranks;
  }
  const budget = skillRankBudget(copy);
  if (budget.spent > budget.available) {
    return {error: `that spends ${budget.spent} ranks of the ${budget.available} the character has, ${budget.spent - budget.available} too many`};
  }

  return service.labelled(`skill ranks: ${changes.map(c => `${c.name} ${c.ranks}`).join(', ')}`, () => {
    const skills = raw.skills;
    for (const {key, sub, ranks} of changes) {
      skills[key] ??= {name: key, ranks: 0, value: 0, classSkill: false, baseAbility: skillAbilityMap[key] || 'int'};
      if (sub) {
        skills[key].subSkills ??= {};
        skills[key].subSkills![sub] ??= {name: sub, ranks: 0, value: 0, classSkill: false, baseAbility: skills[key].baseAbility};
        skills[key].subSkills![sub].ranks = ranks;
      } else skills[key].ranks = ranks;
    }
    service.update({skills});
    const left = skillRankBudget(service.applied());
    return {done: `skill ranks: ${changes.map(c => `${c.name} ${c.ranks}`).join(', ')}`, ranksLeft: left.available - left.spent};
  });
};

export const chooseAbilityIncrease = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const levels = service.raw().classLevels || [];
  const owed = owedIncreases(levels);
  const ability = lower(args['ability']);
  if (!ABILITIES.includes(ability)) return {error: `ability is one of ${ABILITIES.join(', ')}`};
  const level = args['level'] === undefined || args['level'] === null || args['level'] === '' ? owed[0] : Math.floor(Number(args['level']));
  if (!level || !owed.includes(level)) return {error: owed.length ? `the levels owed an ability increase are ${owed.join(', ')}` : 'no ability increase is owed'};
  return service.labelled(`level ${level} ability increase: ${ability}`, () => {
    levels[level - 1].abilityIncrease = ability;
    service.update({classLevels: [...levels]});
    return {done: `+1 ${ability} for level ${level}`, [ability]: service.applied().abilityScores[ability], stillOwed: pendingAbilityIncreases(service.raw())};
  });
};

// changes the favored class bonus of a level the character has: +1 hp, +1 skill rank, or an alternate bonus of its
// race. a level added without it could not be changed, and the AI undid the class to add it again
export const setFavoredClassBonus = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const raw = service.raw();
  const levels = raw.classLevels || [];
  const at = args['level'] === undefined || args['level'] === '' ? levels.length : Math.floor(Number(args['level']));
  const entry = levels[at - 1];
  if (!entry) return {error: `level is a character level the character has, 1 to ${levels.length}`};
  const favored = text(args['favored_class_bonus']) as FavoredClassBonus;
  if (!['hp', 'skill', 'other'].includes(favored)) return {error: 'favored_class_bonus is hp, skill or other'};
  // a character with no favored class takes the class of its first level
  const favoredClasses = (raw.favoredClasses || []).length ? raw.favoredClasses : [levels[0].name];
  if (!favoredClasses.some(name => lower(name) === lower(entry.name))) {
    return {error: `${entry.name} is not a favored class (${favoredClasses.join(', ')}): set_character_details favored_classes first`};
  }
  let option: FavoredClassOption | undefined;
  let isNew = false;
  let picks: {picks?: {[choice: string]: string}, problems: string[]} = {problems: []};
  if (favored === 'other') {
    const options = raw.race?.favoredClassOptions || [];
    const said = args['favored_class_option'];
    const named = typeof said === 'string' && !said.trim().startsWith('{') ? said : '';
    option = said === undefined || said === '' || named ? findOption(options, entry.name, named) : undefined;
    if (!option && said !== undefined && said !== '' && !named) {
      const read = favoredClassOptionFrom(said, entry.name);
      if (!read.option) return {error: 'nothing was changed', problems: read.problems};
      option = options.find(o => sameOption(o, read.option!)) ?? read.option;
      isNew = !options.includes(option);
    }
    if (!option) return {error: `give favored_class_option, the race's alternate bonus for ${entry.name}${options.length ? ` (it has: ${options.map(o => o.name || o.description).join('; ')})` : ''}`};
    picks = favoredPicksFrom(option, args['favored_class_choices']);
    if (picks.problems.length) return {error: 'nothing was changed', problems: picks.problems};
  }
  return service.labelled(`level ${at}: favored class bonus ${favored === 'other' ? option!.name || option!.description : favored}`, () => {
    entry.favoredClassBonus = favored;
    if (option) entry.favoredClassOption = option.id; else delete entry.favoredClassOption;
    if (picks.picks) entry.favoredClassChoices = picks.picks; else delete entry.favoredClassChoices;
    service.update({
      classLevels: [...levels], favoredClasses,
      ...(isNew ? {race: {...raw.race, favoredClassOptions: [...(raw.race?.favoredClassOptions || []), option!]}} : {}),
    });
    return {done: `${entry.name} ${entry.level} (character level ${at}) gives ${favored === 'hp' ? '+1 hp' : favored === 'skill' ? '+1 skill rank' : option!.description}`, hp: service.applied().hp};
  });
};
