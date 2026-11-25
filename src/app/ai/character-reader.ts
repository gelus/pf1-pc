import {sensesText} from '../rules/senses';
import {companionLevel, companionLine} from '../rules/companions';
import {evolutionPool, evolutionsOf, maxAttacks} from '../rules/eidolon.rule';
import {ls} from '../utils/localstorage.util';
import {archetypesOverview} from './archetypes';
import {casterOverview} from './spell-form';
import {abilityDamagePenalty, abilityDamagePoints, abilityModifier, AbilityModAlgorithm} from '../ability-mod.pipe';
import {AdjustmentMapEntry, ApplyCharacterService} from '../apply-character.service';
import {Feature, sizes} from '../interfaces/character.interface';
import {
  isSkillStat, isStrOrDexSkillStat, skillAdditional, skillOfStatPath, statAbilityModifier, statTotal, StatSpec,
} from '../stat-display/stat-total';
import {Character} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';
import {evaluateVal} from '../utils/object.util';
import {isSkillFamily} from '../utils/skilllist.class';

// what the AI reads of the character: a summary of the sheet, and where each number comes from. every number is the
// one the sheet shows (see stat-total.ts), and every line of an explanation one of its tooltip

export const abilityNames = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

// the headline stats of the sheet and how the sheet totals each one (see character-sheet.component.html)
export const sheetStats: {[name: string]: {label: string, spec: (char: Character) => StatSpec}} = {
  init: {label: 'Initiative', spec: () => ({stat: 'init', abilities: ['dex']})},
  ac: {label: 'AC', spec: char => ({stat: 'ac', abilities: ['dex'], maxAbilityBonus: char.maxDexBonus})},
  touchAc: {label: 'Touch AC', spec: char => ({stat: 'touchAc', abilities: ['dex'], maxAbilityBonus: char.maxDexBonus})},
  flatFootedAc: {
    label: 'Flat-footed AC',
    // flat-footed keeps a dex penalty, never a dex bonus
    spec: char => ({stat: 'flatFootedAc', abilities: abilityModifier(char, 'dex') < 0 ? ['dex'] : []}),
  },
  hp: {label: 'Max HP', spec: () => ({stat: 'hp'})},
  bab: {label: 'BAB', spec: () => ({stat: 'bab'})},
  cmb: {label: 'CMB', spec: char => ({stat: 'cmb', abilities: ['str'], additional: [[char.bab, 'bab']]})},
  cmd: {label: 'CMD', spec: char => ({stat: 'cmd', abilities: ['str', 'dex'], additional: [[10, 'base'], [char.bab, 'bab']]})},
  'saves.fort': {label: 'Fortitude', spec: () => ({stat: 'saves.fort', abilities: ['con']})},
  'saves.ref': {label: 'Reflex', spec: () => ({stat: 'saves.ref', abilities: ['dex']})},
  'saves.will': {label: 'Will', spec: () => ({stat: 'saves.will', abilities: ['wis']})},
  'speed.land': {label: 'Speed', spec: () => ({stat: 'speed.land'})},
  'speed.fly': {label: 'Fly speed', spec: () => ({stat: 'speed.fly'})},
  'speed.swim': {label: 'Swim speed', spec: () => ({stat: 'speed.swim'})},
  'speed.climb': {label: 'Climb speed', spec: () => ({stat: 'speed.climb'})},
  'speed.burrow': {label: 'Burrow speed', spec: () => ({stat: 'speed.burrow'})},
  ...Object.fromEntries(abilityNames.map(a => [`abilityScores.${a}`, {label: a.toUpperCase(), spec: () => ({stat: `abilityScores.${a}`})}])),
  maxDexBonus: {label: 'Max Dex bonus', spec: () => ({stat: 'maxDexBonus'})},
  armorCheckPenalty: {label: 'Armor check penalty', spec: () => ({stat: 'armorCheckPenalty'})},
  spellFailureChance: {label: 'Spell failure chance', spec: () => ({stat: 'spellFailureChance'})},
  arcaneSpellFailureChance: {label: 'Arcane spell failure chance', spec: () => ({stat: 'arcaneSpellFailureChance'})},
};

// other names the AI (or a player) may use for a stat
const statAliases: {[alias: string]: string} = {
  initiative: 'init', armor: 'ac', 'armor class': 'ac', touch: 'touchAc', 'touch ac': 'touchAc',
  'flat footed': 'flatFootedAc', 'flat-footed': 'flatFootedAc', 'flat-footed ac': 'flatFootedAc', 'flatfooted': 'flatFootedAc',
  'hit points': 'hp', 'max hp': 'hp', 'base attack bonus': 'bab', fort: 'saves.fort', fortitude: 'saves.fort',
  ref: 'saves.ref', reflex: 'saves.ref', will: 'saves.will', speed: 'speed.land', 'land speed': 'speed.land',
  'climb speed': 'speed.climb', 'swim speed': 'speed.swim', 'fly speed': 'speed.fly', 'burrow speed': 'speed.burrow',
  burrow: 'speed.burrow', strength: 'abilityScores.str', dexterity: 'abilityScores.dex',
  constitution: 'abilityScores.con', intelligence: 'abilityScores.int', wisdom: 'abilityScores.wis',
  charisma: 'abilityScores.cha', str: 'abilityScores.str', dex: 'abilityScores.dex', con: 'abilityScores.con',
  int: 'abilityScores.int', wis: 'abilityScores.wis', cha: 'abilityScores.cha', acp: 'armorCheckPenalty',
  'max dex': 'maxDexBonus', 'max dex bonus': 'maxDexBonus',
};

// every skill of the character by the name the sheet gives it ("stealth", "knowledge (arcana)") and its stat path
export const skillStats = (char: Character): {name: string, stat: string}[] =>
  Object.entries(char.skills || {}).flatMap(([key, skill]) =>
    isSkillFamily(key)
      ? Object.keys(skill.subSkills || {}).map(sub => ({name: `${key} (${sub})`, stat: `skills.${key}.subSkills.${sub}.value`}))
      : [{name: key, stat: `skills.${key}.value`}]);

// "Knowledge (Arcana)", "knowledge: arcana" and "skills.knowledge.subSkills.arcana.value" are the same skill
const normalizeSkillName = (name: string): string => name.toLowerCase()
  .replace(/^skills\./, '').replace(/\.value$/, '').replace(/\.subskills\./, ' ')
  .replace(/[():,]/g, ' ').replace(/\s+/g, ' ').trim();

const skillSpec = (char: Character, stat: string): StatSpec => {
  const skill = skillOfStatPath(char, stat);
  return {stat, abilities: skill?.baseAbility ? [skill.baseAbility] : [], additional: skillAdditional(skill)};
};

// the stat a name stands for: a sheet stat, an alias, a skill by name or path. undefined when there is none
export const resolveStat = (char: Character, name: string): {stat: string, label: string, spec: StatSpec} | undefined => {
  const key = name.trim();
  const lower = key.toLowerCase();
  const direct = sheetStats[key] ? key : statAliases[lower] || Object.keys(sheetStats).find(s => s.toLowerCase() === lower);
  if (direct && sheetStats[direct]) return {stat: direct, label: sheetStats[direct].label, spec: sheetStats[direct].spec(char)};
  const skill = skillStats(char).find(s => normalizeSkillName(s.name) === normalizeSkillName(key));
  if (skill) return {stat: skill.stat, label: skill.name, spec: skillSpec(char, skill.stat)};
  return undefined;
};

export interface StatLine {
  value: number | string;
  source: string;
  type?: string;
  // how it combines: set (replaces the base value), min (caps it), max (floors it)
  mode?: string;
  // why it does not count, when it does not
  notApplied?: string;
}

export interface StatExplanation {
  stat: string;
  label: string;
  total: number | 'auto-fail';
  lines: StatLine[];
  // bonuses that only apply sometimes ("vs. fear"), with the total in that case
  situational: {name: string, total: number | 'auto-fail', lines: StatLine[]}[];
  // what the sheet would not explain otherwise: the part of the total no adjustment gives (the score the player
  // rolled, a value set by hand)
  note?: string;
}

const modeNames: {[mode: string]: string} = {set: 'set to', min: 'capped at', max: 'at least'};

// notStacking: the stat's bonuses a larger one of their type from another of its paths beats
const entryLine = (entry: AdjustmentMapEntry, char: Character, notStacking?: Set<AdjustmentMapEntry>): StatLine => {
  const evaluated = typeof entry.value === 'string' ? evaluateVal(entry.value, char) : entry.value;
  return {
    value: typeof evaluated === 'number' && !Number.isNaN(evaluated) ? evaluated : entry.value,
    source: entry.origin || 'unnamed feature',
    ...(entry.type ? {type: entry.type} : {}),
    ...(entry.mode ? {mode: modeNames[entry.mode] || entry.mode} : {}),
    ...(entry.overwritten || notStacking?.has(entry) ? {notApplied: entry.mode ? 'another set, cap or floor wins' : 'a larger bonus of the same type applies instead'} : {}),
  };
};

// a stat's spec with what its bonuses that do not stack across its paths take off (the sheet's total)
const stackedSpec = (service: ApplyCharacterService, char: Character, spec: StatSpec): StatSpec =>
  ({...spec, notStacking: service.notStackingTotal(spec.stat, char)});

// where the total of a stat comes from, line by line, the way its tooltip on the sheet shows it
export const explainStat = (service: ApplyCharacterService, name: string): StatExplanation | {error: string} => {
  const char = service.applied();
  const resolved = resolveStat(char, name);
  if (!resolved) {
    return {error: `there is no stat "${name}". stats: ${Object.keys(sheetStats).join(', ')}, or a skill by name (stealth, knowledge (arcana)), or explain an attack by its name`};
  }
  const {stat, label, spec} = resolved;
  const lines: StatLine[] = [];
  const byPath = (path: string) => (service.adjustmentsMap[path] || []).filter(e => e.variant === undefined);
  const notStacking = service.notStackingEntries(stat, char);

  for (const [value, what] of spec.additional || []) if (value) lines.push({value, source: what});
  for (const ability of spec.abilities || []) {
    const bonus = AbilityModAlgorithm(Number(char.abilityScores?.[ability as keyof Character['abilityScores']] ?? 10), spec.maxAbilityBonus ?? Infinity);
    const denied = ability === 'dex' && statAbilityModifier(char, spec, ability) === 0
      && abilityModifier(char, ability, spec.maxAbilityBonus ?? Infinity) > 0;
    const capped = spec.maxAbilityBonus !== undefined && AbilityModAlgorithm(Number(char.abilityScores?.[ability as keyof Character['abilityScores']] ?? 10)) > spec.maxAbilityBonus;
    lines.push({
      value: bonus, source: `${ability} modifier${capped ? ` (capped at ${spec.maxAbilityBonus} by the max Dex bonus)` : ''}`,
      ...(denied ? {notApplied: 'the dex bonus is denied'} : {}),
    });
    const penalty = abilityDamagePenalty(char, ability);
    if (penalty) {
      lines.push({value: penalty, source: `${ability} damage (${abilityDamagePoints(char, ability)})`, ...(denied ? {notApplied: 'the dex bonus is denied'} : {})});
    }
  }
  if (stat.startsWith('saves.')) lines.push(...byPath('savingThrowBonus').map(e => entryLine(e, char, notStacking)));
  if (isSkillStat(stat)) {
    lines.push(...byPath('skillCheckBonus').map(e => entryLine(e, char, notStacking)));
    if (isStrOrDexSkillStat(char, stat)) {
      const acp = byPath('armorCheckPenalty');
      if (acp.length) lines.push(...acp.map(e => ({...entryLine(e, char, notStacking), source: `armor check penalty from ${e.origin}`})));
      else if (char.armorCheckPenalty) lines.push({value: char.armorCheckPenalty, source: 'armor check penalty'});
    }
  }
  lines.push(...byPath(stat).map(e => entryLine(e, char, notStacking)));

  const paths = [...service.getInheritedBonusPaths(stat, char), ...(isStrOrDexSkillStat(char, stat) ? ['armorCheckPenalty'] : []), stat];
  const autoFail = service.hasBaseAutoFail(paths);
  const total = statTotal(char, stackedSpec(service, char, spec));
  const situational = service.computeVariantsForPaths(paths, autoFail ? 'auto-fail' : total, char).map(variant => ({
    name: variant.name,
    total: variant.total,
    lines: variant.entries.map(({entry, overwritten}) => ({...entryLine(entry, char), ...(overwritten ? {notApplied: 'a larger bonus of the same type applies instead'} : {})})),
  }));

  // the lines that add, against the total: what is left is the character's own value (a rolled score, a base speed)
  const anyMode = lines.some(l => l.mode && !l.notApplied);
  const added = lines.filter(l => !l.notApplied && !l.mode && typeof l.value === 'number').reduce((sum, l) => sum + (l.value as number), 0);
  const rest = total - added;
  const note = !anyMode && rest !== 0 && !autoFail
    ? `${rest > 0 ? '+' : ''}${rest} is the character's own value, not from any feature${stat.startsWith('abilityScores.') ? ' (the score as rolled or bought)' : stat === 'ac' || stat === 'touchAc' || stat === 'flatFootedAc' ? ' (the base 10)' : ''}`
    : undefined;
  return {stat, label, total: autoFail ? 'auto-fail' : total, lines, situational, ...(note ? {note} : {})};
};

// the features of the character, by where they come from: the active ones, and with off those switched off too (a style
// feat out of its stance, a toggle: Crane Style left off the summary was a feat the AI could not see it had)
export const featureSources = (char: Character, options: {off?: boolean} = {}): {where: string, feature: Feature}[] => [
  ...(char.race?.features || []).map(feature => ({where: `race (${char.race.name})`, feature})),
  ...(char.classLevels || []).flatMap((level, i) =>
    (level.features || []).map(feature => ({where: `${level.name || 'class'} level ${i + 1}`, feature}))),
  ...(['feats', 'traits', 'drawbacks', 'specialAttack', 'defensiveAbilities', 'specialQuality'] as const)
    .flatMap(list => ((char as any)[list] || []).map((feature: Feature) => ({where: list, feature}))),
  ...(char.inventory || []).filter(item => item.equipped)
    .flatMap(item => (item.features || []).map(feature => ({where: `item (${item.name})`, feature}))),
].filter(({feature}) => feature && (options.off || feature.active !== false));

// the conditions the character is under now: those the player put on it and those the rules give it
export const activeConditions = (service: ApplyCharacterService): {name: string, source: string, reason?: string}[] => {
  const raw = service.raw();
  service.applied();
  return [
    ...(raw.conditions || []).map((c, i) => ({c, i})).filter(({c, i}) => c && c.active !== false && !service.isConditionSuppressed(i))
      .map(({c}) => ({name: c.name || 'unnamed', source: c.source || 'the player'})),
    ...service.ruleConditions().map((c, i) => ({c, i})).filter(({i}) => !service.isRuleConditionSuppressed(i))
      .map(({c}) => ({name: c.name || 'unnamed', source: c.source || 'the rules', ...(c.reason ? {reason: c.reason} : {})})),
  ];
};

const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

// the sheet in short: what a player would look at first, every number final
export const characterSummary = (service: ApplyCharacterService): object => {
  const char = service.applied();
  const raw = service.raw();
  const total = (name: string) => statTotal(char, stackedSpec(service, char, sheetStats[name].spec(char)));
  const classes: {[name: string]: number} = {};
  for (const level of raw.classLevels || []) classes[level.name || 'unnamed'] = (classes[level.name || 'unnamed'] || 0) + 1;
  const attacks = (list: 'melee' | 'ranged') => (char[list] || []).filter(a => a.result).map(a => ({
    name: a.name,
    attack: a.result!.attackBonuses.map(signed).join('/'),
    damage: a.result!.damage.expression,
    critical: a.result!.critical,
    ...(a.result!.notes?.length ? {notes: a.result!.notes} : {}),
  }));
  // each caster with its spells by level: known, in its book, prepared (spell-form.ts)
  const casters = (type: 'spells' | 'spellLikeAbilities') => Object.entries(char[type] || {}).map(([origin, caster]) => casterOverview(origin, caster));
  const trainedOrModified = skillStats(char).map(({name, stat}) => ({name, stat, skill: skillOfStatPath(char, stat)}))
    .filter(({skill, stat}) => skill && (skill.ranks > 0 || skill.classSkill || (service.adjustmentsMap[stat] || []).length));
  return {
    name: char.name,
    race: char.race?.name,
    size: sizes[char.size] ?? char.size,
    alignment: char.alignment,
    level: characterLevel(raw),
    classes,
    ...(archetypesOverview(raw.classLevels || []) ? {archetypes: archetypesOverview(raw.classLevels || [])} : {}),
    // its companions, each a character of its own; and what it is, for a companion
    ...((raw.companions || []).length ? {companions: (raw.companions || []).map(id => ls.getItem('character-' + id)).filter(Boolean)
      .map((c: Character) => `${c.name} (${c.master?.kind ?? 'companion'}, level ${characterLevel(c)})`)} : {}),
    ...(companionLine(raw) ? {companionOf: companionLine(raw)} : {}),
    ...(raw.master?.kind === 'eidolon' ? {evolutions: {
      spent: evolutionsOf(raw).reduce((sum, f) => sum + (Number(f.cost) || 0), 0), pool: evolutionPool(raw.master),
      mostAttacks: maxAttacks(companionLevel(raw.master)), taken: evolutionsOf(raw).map(f => `${f.name} (${f.cost})`)}} : {}),
    experience: raw.experience,
    abilities: Object.fromEntries(abilityNames.map(a => [a, {score: char.abilityScores[a], modifier: abilityModifier(char, a)}])),
    hp: {max: total('hp'), current: char.currentHp, temporary: char.currentTempHp || 0, nonlethal: char.nonlethalDamage || 0},
    ac: {ac: total('ac'), touch: total('touchAc'), flatFooted: total('flatFootedAc')},
    initiative: total('init'),
    saves: {fort: total('saves.fort'), ref: total('saves.ref'), will: total('saves.will')},
    bab: char.bab, cmb: total('cmb'), cmd: total('cmd'),
    senses: sensesText(char.senses) || 'none',
    speed: Object.fromEntries(Object.entries(char.speed || {}).filter(([, v]) => v).map(([k]) => [k, total(`speed.${k}`)])),
    melee: attacks('melee'), ranged: attacks('ranged'),
    skills: Object.fromEntries(trainedOrModified.map(({name, stat}) => [name, statTotal(char, stackedSpec(service, char, skillSpec(char, stat)))])),
    otherSkills: 'every other skill at its ability modifier (ask explain_stat for one)',
    conditions: activeConditions(service),
    features: featureSources(raw, {off: true}).map(({where, feature}) => `${feature.name} (${where}${feature.active === false ? ', switched off' : ''})`),
    inventory: (raw.inventory || []).map(item => `${item.quantity > 1 ? `${item.quantity} ` : ''}${item.name}${item.equipped ? ' (equipped)' : ''}${item.carried === false ? ' (left behind)' : ''}`),
    load: char.load, maxDexBonus: char.maxDexBonus ?? 'none', armorCheckPenalty: char.armorCheckPenalty,
    defenses: {
      damageReduction: char.damageReduction, energyResistance: char.energyResistance,
      spellResistance: char.spellResistance, immunities: char.immunities, concealment: char.concealment,
    },
    spellcasting: casters('spells'), spellLikeAbilities: casters('spellLikeAbilities'),
    combatOptions: Object.entries(char.combatOptions || {}).filter(([, on]) => on).map(([o]) => o),
    languages: char.languages,
    wealth: raw.wealth,
  };
};

// what makes up an attack: its bonus and damage, part by part
export const explainAttack = (service: ApplyCharacterService, name: string): object => {
  const char = service.applied();
  const all = [...(char.melee || []).map(a => ({a, kind: 'melee'})), ...(char.ranged || []).map(a => ({a, kind: 'ranged'}))];
  const found = all.filter(({a}) => (a.name || '').toLowerCase() === name.trim().toLowerCase());
  const match = found.length ? found : all.filter(({a}) => (a.name || '').toLowerCase().includes(name.trim().toLowerCase()));
  if (!match.length) return {error: `there is no attack "${name}", the attacks are: ${all.map(({a}) => a.name).join(', ') || 'none'}`};
  return match.filter(({a}) => a.result).map(({a, kind}) => ({
    name: a.name, kind,
    attackBonuses: a.result!.attackBonuses.map(signed).join('/'),
    toHit: a.result!.toHit.parts.map(p => ({value: p.value, source: p.origin, ...(p.type ? {type: p.type} : {}), ...(p.overwritten ? {notApplied: 'a larger bonus of the same type applies instead'} : {})})),
    damage: a.result!.damage.expression,
    damageParts: a.result!.damage.parts.map(p => ({value: p.value, source: p.origin, ...(p.type ? {type: p.type} : {}), ...(p.overwritten ? {notApplied: 'a larger bonus of the same type applies instead'} : {})})),
    critical: a.result!.critical,
    ...(a.result!.range ? {range: a.result!.range} : {}),
    notes: a.result!.notes,
  }));
};

// a feature of the character by name: what it does and where it comes from
// an item of the inventory, as the player keeps it: what it is and the features it gives while equipped
export const findItem = (service: ApplyCharacterService, name: string): object => {
  const items = service.raw().inventory || [];
  const lower = name.trim().toLowerCase();
  const exact = items.filter(i => (i.name || '').toLowerCase() === lower);
  const match = exact.length ? exact : items.filter(i => lower && (i.name || '').toLowerCase().includes(lower));
  if (!match.length) return {error: `the character has no item "${name}"`, items: items.map(i => i.name)};
  return match.map(item => ({
    name: item.name, type: item.type, slot: item.slot, equipped: item.equipped, carried: item.carried !== false,
    quantity: item.quantity, weight: item.weight, cost: item.cost, description: item.description,
    features: (item.features || []).map(f => ({name: f.name, adjustments: f.adjustments, ...(f.charges ? {charges: f.charges} : {})})),
  }));
};

export const findFeature = (service: ApplyCharacterService, name: string): object => {
  const raw = service.raw();
  const lower = name.trim().toLowerCase();
  const all = [
    ...featureSources(raw, {off: true}),
    ...(raw.conditions || []).filter(c => c.active !== false).map(feature => ({where: 'conditions', feature})),
    ...service.ruleConditions().map(feature => ({where: 'conditions from the rules', feature})),
  ];
  const found = all.filter(({feature}) => (feature.name || '').toLowerCase() === lower);
  const match = found.length ? found : all.filter(({feature}) => (feature.name || '').toLowerCase().includes(lower));
  if (!match.length) return {error: `the character has no feature "${name}"`, features: all.map(({feature}) => feature.name)};
  return match.map(({where, feature}) => ({
    name: feature.name, where, description: feature.description,
    adjustments: feature.adjustments, ...(feature.charges ? {charges: feature.charges} : {}),
    ...(feature.reason ? {reason: feature.reason} : {}), ...(feature.active === false ? {switchedOff: true} : {}),
  }));
};
