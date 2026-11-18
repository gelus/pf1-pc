import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {CLASS_PRESETS, classLevelFromPreset} from '../rules/class-presets';
import {
  ABILITIES, SAVES, availableFeats, isAbilityIncreaseLevel, isFavoredClassLevel, pendingAbilityIncreases,
} from '../rules/class-progression';
import {levelUpAvailable, nextLevelXp} from '../rules/experience';
import {BabProgression, ClassLevel, FavoredClassBonus, SaveName, characterLevel} from '../utils/classlevel.class';
import {KNOWLEDGE_SPECIALTIES, getSkillList, isSkillFamily, skillAbilityMap} from '../utils/skilllist.class';
import {describe, describeAdjustments, provenance, unchecked} from './builders';
import {mechanicsProblems, mechanicsRefusal, withoutMarks} from './mechanics';
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
  };
};

const featuresOf = (value: unknown): {features?: Feature[], error?: string} => {
  if (value === undefined || value === null || value === '') return {features: []};
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (e) {
      return {error: `features is not valid JSON: ${(e as Error).message}`};
    }
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  // adjustments left out are none (a new Feature would start with an example one)
  return {features: list.map((f: any) => new Feature({...f, description: f?.description ?? '', adjustments: f?.adjustments ?? {}}))};
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
    const missing = [
      ...([6, 8, 10, 12].includes(hitDie) ? [] : ['hit_die (6, 8, 10 or 12)']),
      ...(['full', 'threeQuarters', 'half'].includes(bab) ? [] : ['bab (full, threeQuarters or half)']),
      ...(goodSaves.every(s => SAVES.includes(s)) ? [] : ['good_saves (fort, ref, will)']),
      ...(skillRanks > 0 ? [] : ['skill_ranks']),
    ];
    if (missing.length) {
      return {error: `${className} is not a core class the app knows (${CLASS_PRESETS.map(p => p.name).join(', ')}): look its class page up and give ${missing.join(', ')}`};
    }
    entry = new ClassLevel({
      name: className, level: 1, hitDice: hitDie, rolledHp: 0, skillRanks, classSkills, babProgression: bab, goodSaves,
      startingWealth: 0, features: [],
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

  const favored = text(args['favored_class_bonus']) as FavoredClassBonus;
  if (favored) {
    if (!['hp', 'skill', 'other'].includes(favored)) return {error: 'favored_class_bonus is hp, skill or other'};
    if (!isFavoredClassLevel(raw, entry)) return {error: `${entry.name} is not a favored class of the character (${(raw.favoredClasses || []).join(', ') || 'none'})`};
    entry.favoredClassBonus = favored;
  }

  const increase = lower(args['ability_increase']);
  if (increase) {
    if (!isAbilityIncreaseLevel(newCharacterLevel)) return {error: `level ${newCharacterLevel} gives no ability increase, every 4th level does`};
    if (!ABILITIES.includes(increase)) return {error: `ability_increase is one of ${ABILITIES.join(', ')}`};
    entry.abilityIncrease = increase;
  }

  const given = featuresOf(args['features']);
  if (given.error) return {error: given.error};
  const features = withoutMarks(given.features!);
  // where the class features come from, as for create_feature: the class page, the player, or memory
  const source = features.length ? provenance(args) : undefined;
  if (source?.error || (source && !source.basedOn)) return {error: source!.error};
  for (const feature of features) {
    if (source?.basedOn) feature.description = describe(feature.description || '', source.basedOn, source.sourceUrl);
  }
  const problems = features.flatMap((f, i) => validateFeature(JSON.parse(JSON.stringify(f)), {reference: service.applied()}, `${f.name || 'feature'} [${i}]`));
  if (hasErrors(problems)) {
    return {error: 'nothing was added: fix these problems in the class features and call again', problems: formatProblems(problems)};
  }
  // the class features' rules as adjustments, shown on the sheet, toggled where the player sees them
  const mechanics = mechanicsProblems(given.features!, {classFeatures: true});
  if (mechanics.length) return mechanicsRefusal(mechanics);
  entry.features = features;

  const before = service.applied();
  const was = {hp: before.hp, bab: before.bab, fort: before.saves.fort, ref: before.saves.ref, will: before.saves.will};
  const label = `level ${newCharacterLevel}: ${entry.name} ${entry.level}`;
  return service.labelled(label, () => {
    service.update({classLevels: [...levels, entry]});
    const after = service.applied();
    const ranks = skillRankBudget(after);
    const owed = owedIncreases(service.raw().classLevels || []);
    const featsOwed = availableFeats(after) - (after.feats || []).length;
    return {
      done: `level ${newCharacterLevel}: ${entry.name} ${entry.level}${features.length ? ` with ${features.map(f => f.name).join(', ')}${unchecked(source!.basedOn!)}` : ''}`,
      now: {hp: `${was.hp} -> ${after.hp}`, bab: `${was.bab} -> ${after.bab}`, saves: `fort ${was.fort} -> ${after.saves.fort}, ref ${was.ref} -> ${after.saves.ref}, will ${was.will} -> ${after.saves.will}`},
      ...(features.length ? {classFeatures: features.map(f => `${f.name}: ${describeAdjustments(f.adjustments) || 'description only'}`)} : {}),
      stillToDo: [
        ...(ranks.available - ranks.spent > 0 ? [`${ranks.available - ranks.spent} skill ranks to spend (set_skill_ranks)`] : []),
        ...(featsOwed > 0 ? [`${featsOwed} feat${featsOwed > 1 ? 's' : ''} to pick (look it up, create_feature in feats)`] : []),
        ...(owed.length ? [`an ability increase for level ${owed.join(', ')} (choose_ability_increase)`] : []),
        'class features whose numbers are fixed rather than a formula of the class level (rounds of rage, sneak attack dice) are changed with edit_feature',
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
  let wanted: {[skill: string]: unknown} = {};
  const given = args['ranks'];
  if (typeof given === 'string') {
    try {
      wanted = JSON.parse(given);
    } catch (e) {
      return {error: `ranks is not valid JSON: ${(e as Error).message}`};
    }
  } else if (given && typeof given === 'object') wanted = given as {[skill: string]: unknown};
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
