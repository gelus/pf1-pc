import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {CLASS_PRESETS, classLevelFromPreset} from '../rules/class-presets';
import {
  ABILITIES, SAVES, availableFeats, isAbilityIncreaseLevel, isFavoredClassLevel, pendingAbilityIncreases,
} from '../rules/class-progression';
import {levelUpAvailable, nextLevelXp} from '../rules/experience';
import {BabProgression, ClassLevel, FavoredClassBonus, Proficiencies, SaveName, characterLevel} from '../utils/classlevel.class';
import {KNOWLEDGE_SPECIALTIES, getSkillList, isSkillFamily, skillAbilityMap} from '../utils/skilllist.class';
import {describe, describeAdjustments, provenance, unchecked} from './builders';
import {parseJsonList} from './json-arg';
import {abilityModifier} from '../ability-mod.pipe';
import {domainProblems, mechanicsProblems, mechanicsRefusal, normalizedFeature, shownOnSheet, toggledWhenActivated, withoutMarks, CLASS_FEATURE_RECIPE} from './mechanics';
import {formulasPutRight} from './class-formulas';
import {ActionResult} from './play-actions';

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
    hitPoints: {max: applied.hp, conModifier: Math.floor(((applied.abilityScores?.con ?? 10) - 10) / 2)},
    abilityIncreasesOwed: owedIncreases(levels),
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
// the uses of the core features whose text the AI leaves the formula out of
const KNOWN_USES: {[feature: string]: [string, string]} = {
  'rage': ['4', 'con'], 'channel energy': ['3', 'cha'], 'bardic performance': ['4', 'cha'],
};
const usesWorkedOut = (feature: Feature, applied: unknown): string | undefined => {
  const holders = [feature, ...Object.values(feature.adjustments || {}).filter((v: any) => v && typeof v === 'object' && v.charges)] as Feature[];
  for (const holder of holders) {
    if (!holder.charges) continue;
    const known = KNOWN_USES[(feature.name || '').trim().toLowerCase()];
    const from = USES_FROM.exec(`${holder.description || ''} ${feature.description || ''}`) || (known && [, known[0], known[1]] as unknown as RegExpExecArray);
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

export const addClassLevel = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const raw = service.raw();
  const levels = raw.classLevels || [];
  const className = text(args['class_name']);
  if (!className) return {error: 'class_name is the class the level is in'};
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
    ];
    if (missing.length) {
      return {error: `${className} is not a core class the app knows (${CLASS_PRESETS.map(p => p.name).join(', ')}): look its class page up and give ${missing.join(', ')}`};
    }
    entry = new ClassLevel({
      name: className, level: 1, hitDice: hitDie, rolledHp: 0, skillRanks, classSkills, babProgression: bab, goodSaves,
      startingWealth: newCharacterLevel === 1 ? startingGold : 0, features: [], proficiencies,
    });
  }

  // hit points: the first character level gets the full hit die, later ones what the player rolled
  if (newCharacterLevel > 1) {
    const rolled = Math.floor(Number(args['rolled_hp']));
    if (!(rolled >= 1 && rolled <= entry.hitDice)) {
      return {error: `rolled_hp is the d${entry.hitDice} the player rolled for this level (1 to ${entry.hitDice}), ask for it (or whether they take the average, ${Math.floor(entry.hitDice / 2) + 1}, if the table allows it)`};
    }
    entry.rolledHp = rolled;
  }

  // everything wrong at once: one more call fixes all of it
  const problems: string[] = [];
  const notes: string[] = [];
  // the first level of a character with no favored class yet: the class taken is the favored one
  let favoredClasses: string[] | undefined;
  const favored = text(args['favored_class_bonus']) as FavoredClassBonus;
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

  const given = featuresOf(args['features']);
  if (given.error) return {error: given.error};
  // one the player switches on (studied target, rage) shows as its entry with the toggle, whatever the AI wrote
  // and one the player uses (channel energy) shows as its entry, with its uses a day, even with no number to adjust
  given.features = given.features!.map(toggledWhenActivated).map(shownOnSheet);
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
  // the class features' rules as adjustments, shown on the sheet, toggled where the player sees them
  problems.push(...mechanicsProblems(given.features!, {classFeatures: true}));
  if (entry.level === 1) problems.push(...domainProblems(given.features!));
  if (problems.length) return mechanicsRefusal(problems);
  // the formulas of the class features whose rules the app knows (Track's minimum 1, Studied Target's growth), once
  // the features are right otherwise
  for (const feature of features) notes.push(...formulasPutRight(feature, entry.name));
  entry.features = features;

  const before = service.applied();
  const was = {hp: before.hp, bab: before.bab, fort: before.saves.fort, ref: before.saves.ref, will: before.saves.will};
  const label = `level ${newCharacterLevel}: ${entry.name} ${entry.level}`;
  return service.labelled(label, () => {
    service.update({classLevels: [...levels, entry], ...(favoredClasses ? {favoredClasses} : {})});
    const after = service.applied();
    const ranks = skillRankBudget(after);
    const owed = owedIncreases(service.raw().classLevels || []);
    const featsOwed = availableFeats(after) - (after.feats || []).length;
    return {
      done: `level ${newCharacterLevel}: ${entry.name} ${entry.level}${features.length ? ` with ${features.map(f => f.name).join(', ')}${unchecked(source!.basedOn!)}` : ''}`,
      ...(notes.length ? {notes} : {}),
      now: {hp: `${was.hp} -> ${after.hp}`, bab: `${was.bab} -> ${after.bab}`, saves: `fort ${was.fort} -> ${after.saves.fort}, ref ${was.ref} -> ${after.saves.ref}, will ${was.will} -> ${after.saves.will}`},
      ...(features.length ? {classFeatures: features.map(f => `${f.name}: ${describeAdjustments(f.adjustments) || 'description only'}`)} : {}),
      stillToDo: [
        ...(ranks.available - ranks.spent > 0 ? [`${ranks.available - ranks.spent} skill ranks to spend (set_skill_ranks)`] : []),
        ...(featsOwed > 0 ? [`${featsOwed} feat${featsOwed > 1 ? 's' : ''} to pick (look it up, create_feature in feats)`] : []),
        ...(owed.length ? [`an ability increase for level ${owed.join(', ')} (choose_ability_increase)`] : []),
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
