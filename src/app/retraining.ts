import {ApplyCharacterService} from './apply-character.service';
import {skillRankBudget} from './characterPipes/remaining-ranks.pipe';
import {abilityModifier} from './ability-mod.pipe';
import {Feature} from './interfaces/character.interface';
import {ABILITIES, isAbilityIncreaseLevel} from './rules/class-progression';
import {dependentsOf, unqualifiedFeats} from './rules/prerequisites';
import {RetrainDetail, RetrainKind, RetrainQuote, retrainQuote} from './rules/retraining';
import {Archetype, ClassLevel, characterLevel, featureKey} from './utils/classlevel.class';
import {Character} from './utils/character.class';
import {copperToPurse, purseToCopper} from './utils/wealth.util';
import {Purse} from './utils/item.class';

// retraining a character (rules/retraining.ts), the same for the sheet's retrain dialog and the AI's retrain tool:
// each kind a change of the raw character as one step of the undo history, with what it takes (days, gold) and what
// the rules would have the player know (a feat another feat needs, a feat no longer qualified for). nothing is held
// back for the rules: the table decides, the player is told. the gold is paid only with payGold

export interface RetrainResult {
  done?: string;
  error?: string;
  quote?: RetrainQuote;
  warnings?: string[];
  [more: string]: unknown;
}

const lower = (value: unknown): string => String(value ?? '').trim().toLowerCase();

// what the rules would have the player know once a retraining is made: the feats it left without their prerequisites,
// and those that named what it took away
const warningsAfter = (service: ApplyCharacterService, before: Character, taken?: Feature): string[] => [
  ...(taken ? dependentsOf(before, taken).map(name => `${name} has ${taken.name} as a prerequisite: the rules retrain ${name} first`) : []),
  ...unqualifiedFeats(service.applied()),
];

const result = (
  service: ApplyCharacterService, before: Character, done: string, kind: RetrainKind, detail: RetrainDetail = {},
  taken?: Feature, more: string[] = [],
): RetrainResult => {
  const warnings = [...more, ...warningsAfter(service, before, taken)];
  return {done, quote: retrainQuote(service.raw(), kind, detail), ...(warnings.length ? {warnings} : {})};
};

// the gold a retraining costs, out of the purse: only when the player says to (the sheet's Pay button, the chat's)
export const payGold = (service: ApplyCharacterService, gp: number, what: string): RetrainResult => {
  const copper = Math.round(gp * 100);
  if (!(copper > 0)) return {error: 'nothing to pay'};
  const purse = {...new Purse(), ...(service.raw().wealth || {})};
  const has = purseToCopper(purse);
  if (has < copper) return {error: `the purse has ${has / 100} gp, ${what} costs ${gp} gp`};
  return service.labelled(`pay ${gp} gp for ${what}`, () => {
    service.update({wealth: copperToPurse(has - copper, 'gp')});
    return {done: `paid ${gp} gp for ${what}: ${(has - copper) / 100} gp left`};
  });
};

// ---- features: a feat, a class feature, a racial trait ----

// where a raw feature is kept: the list it is in, of the feats, traits, drawbacks, race or a class level
const listOf = (raw: Character, feature: Feature): Feature[] | undefined =>
  [raw.feats, raw.traits, raw.drawbacks, raw.race?.features, ...(raw.classLevels || []).map(l => l.features)]
    .find(list => (list || []).includes(feature));

// the raw feature of a kind by its name (its id from the sheet): a feat in the feats, a class feature in a class
// level, a racial trait in the race
export const retrainable = (raw: Character, kind: RetrainKind, name: string): Feature | undefined => {
  const lists = kind === 'feat' ? [raw.feats] : kind === 'racial trait' ? [raw.race?.features]
    : kind === 'class feature' ? (raw.classLevels || []).map(l => l.features) : [];
  const all = lists.flatMap(list => list || []);
  return all.find(f => f.id === name) ?? all.find(f => lower(f.name) === lower(name))
    ?? all.find(f => featureKey(f.name || '') === featureKey(name));
};

// a feature traded for another, in its place (the new one built by the AI or the sheet's feature editor): the
// feature's kind says the days. a racial trait trades for one that replaces the same standard trait
export const retrainFeature = (
  service: ApplyCharacterService, kind: RetrainKind, old: Feature, replacement: Feature, detail: RetrainDetail = {},
): RetrainResult => {
  const raw = service.raw();
  const list = listOf(raw, old);
  if (!list) return {error: `${old.name} is not a ${kind} the character has`};
  const before = service.applied();
  const notes: string[] = [];
  if (kind === 'racial trait' && (old.replaces?.length || replacement.replaces?.length)
    && featureKey((old.replaces || []).join()) !== featureKey((replacement.replaces || []).join())) {
    notes.push(`${replacement.name} replaces ${(replacement.replaces || []).join(', ') || 'nothing'}, ${old.name} ${(old.replaces || []).join(', ') || 'nothing'}: the rules trade a racial trait for one replacing the same standard trait`);
  }
  return service.labelled(`retrain ${old.name} into ${replacement.name}`, () => {
    list.splice(list.indexOf(old), 1, replacement);
    service.update();
    return result(service, before, `retrained ${old.name} into ${replacement.name}`, kind, detail, old, notes);
  });
};

// ---- numbers: an ability increase, skill ranks, hit points, a language ----

// the +1 of a character level (4th, 8th, ...) moved to another ability
export const retrainAbilityIncrease = (service: ApplyCharacterService, level: number, to: string): RetrainResult => {
  const raw = service.raw();
  const ability = lower(to).slice(0, 3);
  const entry = raw.classLevels?.[level - 1];
  if (!entry || !isAbilityIncreaseLevel(level)) return {error: `level ${level} has no ability increase (every 4th character level has one)`};
  if (!ABILITIES.includes(ability)) return {error: `the ability is one of ${ABILITIES.join(', ')}`};
  const before = service.applied();
  const was = entry.abilityIncrease;
  return service.labelled(`retrain the level ${level} ability increase into ${ability}`, () => {
    service.update({classLevels: raw.classLevels.map((l, i) => i === level - 1 ? new ClassLevel({...l, abilityIncrease: ability}) : l)});
    return result(service, before, `the level ${level} ability increase moved from ${was || 'none'} to ${ability}`, 'ability increase');
  });
};

// ranks moved from one skill to another: up to the Intelligence bonus of them (at least 1) in one retraining
export const retrainSkillRanks = (
  service: ApplyCharacterService, moves: {from: string, to: string, ranks: number}[],
): RetrainResult => {
  const raw = service.raw();
  const skills = JSON.parse(JSON.stringify(raw.skills || {}));
  const level = Math.max(1, characterLevel(raw));
  const notes: string[] = [];
  const skillAt = (name: string) => {
    const family = /^(\w+) \((.+)\)$/.exec(lower(name));
    if (family) {
      const sub = skills[family[1]]?.subSkills;
      if (!sub) return undefined;
      sub[family[2]] ??= {name: family[2], ranks: 0, value: 0, classSkill: false};
      return sub[family[2]];
    }
    return skills[lower(name)];
  };
  let moved = 0;
  for (const move of moves) {
    const ranks = Math.floor(Number(move.ranks));
    const from = skillAt(move.from);
    const to = skillAt(move.to);
    if (!from || !to) return {error: `there is no skill "${!from ? move.from : move.to}"`};
    if (!(ranks > 0) || ranks > (Number(from.ranks) || 0)) return {error: `${move.from} has ${from.ranks || 0} ranks to move`};
    from.ranks -= ranks;
    to.ranks = (Number(to.ranks) || 0) + ranks;
    if (to.ranks > level) notes.push(`${move.to} has ${to.ranks} ranks, more than the character level (${level})`);
    moved += ranks;
  }
  const most = Math.max(1, abilityModifier(service.applied(), 'int'));
  if (moved > most) notes.push(`${moved} ranks moved, the rules move up to ${most} (the Intelligence bonus, at least 1) in one retraining`);
  const before = service.applied();
  return service.labelled(`retrain ${moved} skill rank${moved > 1 ? 's' : ''}`, () => {
    service.update({skills});
    const {available, spent} = skillRankBudget(service.applied());
    if (spent !== available) notes.push(`${spent} of ${available} ranks are spent`);
    return result(service, before, `moved ${moves.map(m => `${m.ranks} from ${m.from} to ${m.to}`).join(', ')}`, 'skill ranks', {}, undefined, notes);
  });
};

// +1 hit point to a level below its hit die's most (its rolled hit die; the 1st level has its most)
export const retrainHitPoints = (service: ApplyCharacterService, level?: number): RetrainResult => {
  const raw = service.raw();
  const levels = raw.classLevels || [];
  const index = level ? level - 1 : levels.findIndex((l, i) => i > 0 && (Number(l.rolledHp) || 0) < Number(l.hitDice));
  const entry = levels[index];
  if (!entry || index < 1 || (Number(entry.rolledHp) || 0) >= Number(entry.hitDice)) {
    return {error: 'the hit points are at the most the hit dice give: there is nothing to retrain'};
  }
  const before = service.applied();
  return service.labelled(`retrain hit points (level ${index + 1})`, () => {
    service.update({classLevels: levels.map((l, i) => i === index ? new ClassLevel({...l, rolledHp: (Number(l.rolledHp) || 0) + 1}) : l)});
    return result(service, before, `+1 hit point at level ${index + 1} (${entry.name} ${entry.level}: ${(Number(entry.rolledHp) || 0) + 1} of d${entry.hitDice})`, 'hit points');
  });
};

// a language learned: at most 1 + the Intelligence bonus of them by retraining
export const retrainLanguage = (service: ApplyCharacterService, language: string): RetrainResult => {
  const name = String(language || '').trim();
  if (!name) return {error: 'name the language'};
  const raw = service.raw();
  const own = ([] as string[]).concat(raw.languages || []);
  if (own.some(l => lower(l) === lower(name))) return {error: `the character knows ${name} already`};
  const before = service.applied();
  return service.labelled(`retrain: learn ${name}`, () => {
    service.update({languages: [...own, name]});
    return result(service, before, `learned ${name}`, 'language', {}, undefined,
      [`the rules allow 1 + the Intelligence bonus (${1 + Math.max(0, abilityModifier(service.applied(), 'int'))}) languages learned this way`]);
  });
};

// ---- class levels ----

// the highest level of a class taken off, a level of another put on by addNew (the AI's add_class_level, the sheet's
// class level form), as one step: the feats and ability increases of the character levels stay where they were
// (they retrain on their own), so the ability increases are kept by character level. nothing changes when addNew fails
export const retrainClassLevel = (
  service: ApplyCharacterService, fromClass: string, addNew: () => {done?: unknown, error?: unknown},
  detail: RetrainDetail = {},
): RetrainResult & {[more: string]: unknown} => {
  const raw = service.raw();
  const levels = raw.classLevels || [];
  const index = levels.map(l => lower(l.name)).lastIndexOf(lower(fromClass));
  if (index < 0) return {error: `the character has no ${fromClass} level`};
  if (levels.length === 1) return {error: 'the character has one level: a 1st level is changed by editing its class, not retrained'};
  const before = service.applied();
  const removed = levels[index];
  const increases = levels.map(l => l.abilityIncrease);
  return service.labelled(`retrain ${removed.name} ${removed.level}`, () => {
    service.update({classLevels: levels.filter((_, i) => i !== index)});
    const added = addNew();
    if (!added.done) {
      service.update({classLevels: levels});
      return {...(added as object), error: String(added.error ?? 'the new level was not added: nothing was changed')};
    }
    // each character level keeps its ability increase
    const now = service.raw().classLevels;
    service.update({classLevels: now.map((l, i) => new ClassLevel({...l, abilityIncrease: increases[i]}))});
    const entry = service.raw().classLevels[service.raw().classLevels.length - 1];
    return {...result(service, before, `retrained ${removed.name} ${removed.level} into ${entry.name} ${entry.level}`, 'class level', detail),
      added: added.done};
  });
};

// the last class level taken off, as a level built wrong is: its hit points, features and spells go with it, and
// what the character has more of than its levels allow (feats, skill ranks) is told
export const removeLastClassLevel = (service: ApplyCharacterService): RetrainResult => {
  const raw = service.raw();
  const levels = raw.classLevels || [];
  if (levels.length < 2) return {error: 'the character has one class level: remove a 1st level by starting the character over'};
  const last = levels[levels.length - 1];
  return service.labelled(`remove ${last.name} ${last.level}`, () => {
    service.update({classLevels: levels.slice(0, -1)});
    const applied = service.applied();
    const {available, spent} = skillRankBudget(applied);
    const warnings = [
      ...(spent > available ? [`${spent - available} skill ranks more than the levels give: take them off`] : []),
      ...unqualifiedFeats(applied),
    ];
    return {done: `removed ${last.name} ${last.level}: the character is level ${levels.length - 1}`, ...(warnings.length ? {warnings} : {})};
  });
};

// ---- archetypes ----

// an archetype taken after the class features it replaces were gained, or given up: its record on the class, the
// class features it trades taken off the class's levels and the new ones put on them (by the class level they come
// at), as one step. 5 days for each class feature it adds, removes or replaces
export const retrainArchetype = (
  service: ApplyCharacterService, className: string,
  change: {take?: Archetype[], giveUp?: string[], remove?: string[], add?: {classLevel: number, feature: Feature}[]},
): RetrainResult => {
  const raw = service.raw();
  const ofClass = (raw.classLevels || []).filter(l => lower(l.name) === lower(className));
  if (!ofClass.length) return {error: `the character has no ${className} levels`};
  const removing = new Set((change.remove || []).map(featureKey));
  const found = ofClass.flatMap(l => l.features || []).filter(f => removing.has(featureKey(f.name || '')));
  const missing = (change.remove || []).filter(name => !found.some(f => featureKey(f.name || '') === featureKey(name)));
  if (missing.length) return {error: `the ${className} levels have no ${missing.join(', ')}`};
  const misplaced = (change.add || []).filter(a => !ofClass.some(l => l.level === a.classLevel));
  if (misplaced.length) return {error: `${className} has no level ${misplaced.map(a => a.classLevel).join(', ')} for ${misplaced.map(a => a.feature.name).join(', ')}`};
  const before = service.applied();
  const givingUp = new Set((change.giveUp || []).map(lower));
  const features = Math.max(found.length, (change.add || []).length, 1);
  const label = [...(change.take || []).map(a => `take ${a.name}`), ...(change.giveUp || []).map(n => `give up ${n}`)].join(', ') || 'archetype';
  return service.labelled(`retrain ${className}: ${label}`, () => {
    const first = ofClass[0];
    service.update({classLevels: raw.classLevels.map(l => {
      if (lower(l.name) !== lower(className)) return l;
      const kept = (l.archetypes || []).filter(a => !givingUp.has(lower(a.name)));
      const archetypes = l === first ? [...kept, ...(change.take || [])] : kept;
      const levelFeatures = [...(l.features || []).filter(f => !removing.has(featureKey(f.name || ''))),
        ...(change.add || []).filter(a => a.classLevel === l.level).map(a => a.feature)];
      return new ClassLevel({...l, features: levelFeatures, archetypes: archetypes.length ? archetypes : undefined});
    })});
    return result(service, before, `${className}: ${label}${found.length ? `, ${found.map(f => f.name).join(', ')} off` : ''}${(change.add || []).length ? `, ${(change.add || []).map(a => a.feature.name).join(', ')} on` : ''}`,
      'archetype', {features});
  });
};

// ---- spells known ----

// a spontaneous caster's spell known for another of the same level, the new one put on by addNew (the AI's
// add_spells, the sheet's spell form), as one step. nothing changes when addNew fails
export const retrainSpellKnown = (
  service: ApplyCharacterService, origin: string, level: number, oldName: string, addNew: () => {done?: unknown, error?: unknown},
): RetrainResult & {[more: string]: unknown} => {
  const caster = service.applied().spells?.[origin];
  if (!caster) return {error: `the character has no ${origin} caster`};
  const known = caster.spells?.[level]?.spells || [];
  const old = known.find(s => lower(s.name) === lower(oldName));
  if (!old) return {error: `${oldName} is not a level ${level} ${origin} spell the character knows`};
  const notes = caster.casting === 'spontaneous' ? [] : [`${origin} prepares its spells: the rules retrain the spells known of a spontaneous caster`];
  const before = service.applied();
  const saved = JSON.parse(JSON.stringify(service.raw().spells || {}));
  return service.labelled(`retrain ${old.name}`, () => {
    service.deleteSpell('spells', origin, level, old.name, false);
    service.update();
    const added = addNew();
    if (!added.done) {
      service.update({spells: saved});
      return {...(added as object), error: String(added.error ?? 'the new spell was not added: nothing was changed')};
    }
    return {...result(service, before, `retrained ${old.name} (${origin} level ${level}): ${added.done}`, 'spells known', {spellLevel: level}, undefined, notes)};
  });
};
