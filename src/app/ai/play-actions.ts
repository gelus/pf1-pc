import {ApplyCharacterService} from '../apply-character.service';
import {CombatOption, Feature, Spell, alwaysAvailableCombatOptions, combatOptionLabels} from '../interfaces/character.interface';
import {SpellCastingType} from '../rules/spell-sources';
import {currentHpChange} from '../rules/damage-taken';
import {excludedCombatOptions} from '../rules/defensive-combat';
import {RestKind, restSummaryText} from '../rules/rest';
import {defaultCombatOptions} from '../utils/character.class';
import {activeConditions, featureSources} from './character-reader';

// what the AI does to the character during play: damage and healing, conditions, features turned on and off, charges,
// combat options, spells and rest. each action is one step of the undo history, named for what it did, and goes
// through what the sheet itself does (the same engine calls, the same rules), so its numbers are the sheet's
// an action gives back what it did and the numbers after it, or an error the AI can act on. it never throws

export interface ActionResult {
  // what was done, for the chat and the undo history: "took 12 damage"
  done?: string;
  error?: string;
  [detail: string]: unknown;
}

const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();
const amountOf = (value: unknown): number => Math.floor(Number(value));

// finds by name: the exact name, else the only one containing it
const byName = <T>(items: T[], name: string, nameOf: (item: T) => string | undefined): {found?: T, matches: T[]} => {
  const wanted = lower(name);
  const exact = items.filter(item => lower(nameOf(item)) === wanted);
  if (exact.length) return {found: exact[0], matches: exact};
  const partial = wanted ? items.filter(item => lower(nameOf(item)).includes(wanted)) : [];
  return {found: partial.length === 1 ? partial[0] : undefined, matches: partial};
};

const hpNow = (service: ApplyCharacterService) => {
  const char = service.applied();
  return {
    current: char.currentHp, max: char.hp,
    temporary: Number(service.raw().currentTempHp) || Number(service.raw().tempHp) || 0,
    nonlethal: char.nonlethalDamage || 0,
    conditions: activeConditions(service).map(c => c.name),
  };
};

// runs an action as one named step of the undo history
export const act = (service: ApplyCharacterService, label: string, action: () => ActionResult): ActionResult =>
  service.labelled(label, action);

export const takeDamage = (service: ApplyCharacterService, amount: unknown, nonlethal = false): ActionResult => {
  const points = amountOf(amount);
  if (!(points > 0)) return {error: 'the damage is a whole number above 0'};
  const label = `take ${points} ${nonlethal ? 'nonlethal ' : ''}damage`;
  return act(service, label, () => {
    const before = hpNow(service);
    const raw = service.raw();
    // temporary hit points are lost first (core rulebook, temporary hit points), then the hit points
    const tempField = (Number(raw.currentTempHp) || 0) > 0 ? 'currentTempHp' : 'tempHp';
    const temp = Math.max(0, Number(raw[tempField]) || 0);
    const absorbed = Math.min(temp, points);
    const rest = points - absorbed;
    if (nonlethal) {
      service.update({...(absorbed ? {[tempField]: temp - absorbed} : {}), nonlethalDamage: (raw.nonlethalDamage || 0) + rest});
    } else {
      if (absorbed) service.update({[tempField]: temp - absorbed});
      if (rest) service.update(currentHpChange(service.raw(), service.applied(), service.applied().currentHp - rest));
    }
    return {
      done: `took ${points} ${nonlethal ? 'nonlethal ' : ''}damage${absorbed ? ` (${absorbed} off temporary hit points)` : ''}`,
      before, after: hpNow(service),
    };
  });
};

export const heal = (service: ApplyCharacterService, amount: unknown): ActionResult => {
  const points = amountOf(amount);
  if (!(points > 0)) return {error: 'the healing is a whole number above 0'};
  return act(service, `heal ${points}`, () => {
    const before = hpNow(service);
    const char = service.applied();
    const healed = Math.max(0, Math.min(points, char.hp - char.currentHp));
    if (healed) service.update(currentHpChange(service.raw(), service.applied(), char.currentHp + healed));
    // healing hit points heals as much nonlethal damage (core rulebook, nonlethal damage)
    const nonlethal = service.raw().nonlethalDamage || 0;
    if (nonlethal) service.update({nonlethalDamage: Math.max(0, nonlethal - points)});
    return {done: `healed ${points}${healed < points ? ` (${healed} hit points were missing)` : ''}`, before, after: hpNow(service)};
  });
};

export const addCondition = (service: ApplyCharacterService, name: unknown): ActionResult => {
  const templates = service.conditionTemplates();
  const {found, matches} = byName(templates, String(name ?? ''), t => t.name);
  if (!found) {
    return {error: matches.length ? `"${name}" could be ${matches.map(t => t.name).join(', ')}` : `there is no condition "${name}"`,
      conditions: templates.map(t => t.name)};
  }
  if ((service.raw().conditions || []).some(c => lower(c.name) === lower(found.name) && c.active !== false)) {
    return {error: `the character is already ${found.name}`, conditions: activeConditions(service).map(c => c.name)};
  }
  return act(service, `add ${found.name}`, () => {
    service.consumeFeature({feature: found, destination: 'conditions'});
    return {done: `the character is ${found.name}`, conditions: activeConditions(service).map(c => c.name)};
  });
};

export const removeCondition = (service: ApplyCharacterService, name: unknown): ActionResult => {
  const conditions = service.raw().conditions || [];
  const {found, matches} = byName(conditions, String(name ?? ''), c => c.name);
  if (!found) {
    const fromRules = service.ruleConditions().find(c => lower(c.name) === lower(name));
    if (fromRules) return {error: `${fromRules.name} comes from the rules (${fromRules.source || fromRules.reason || 'the character\'s state'}), it ends when that changes`};
    return {error: matches.length > 1 ? `"${name}" could be ${matches.map(c => c.name).join(', ')}` : `the character is not "${name}"`,
      conditions: activeConditions(service).map(c => c.name)};
  }
  return act(service, `remove ${found.name}`, () => {
    service.removeFeature(conditions, found);
    return {done: `the character is no longer ${found.name}`, conditions: activeConditions(service).map(c => c.name)};
  });
};

// the features the sheet lets the player turn on and off or spend charges of (the ones of race, classes, feats,
// traits, special attacks and equipped items), the applied ones: they are the raw character's own objects
const playFeatures = (service: ApplyCharacterService): Feature[] => {
  const applied = service.applied();
  const seen = new Set<Feature>();
  const all = [
    ...featureSources(applied).map(({feature}) => feature),
    // featureSources leaves out what is turned off, turning it on needs those too
    ...(['specialAttack', 'defensiveAbilities', 'specialQuality', 'feats', 'traits'] as const)
      .flatMap(list => ((applied as any)[list] || []) as Feature[]),
  ];
  return all.filter(feature => feature && !seen.has(feature) && seen.add(feature));
};

export const setFeatureActive = (service: ApplyCharacterService, name: unknown, active: unknown): ActionResult => {
  const on = active !== false && active !== 'false';
  const toggles = playFeatures(service).filter(f => typeof f.active !== 'undefined');
  const {found, matches} = byName(toggles, String(name ?? ''), f => f.name);
  if (!found) {
    return {error: matches.length ? `"${name}" could be ${matches.map(f => f.name).join(', ')}` : `the character has no feature "${name}" that turns on and off`,
      features: toggles.map(f => `${f.name} (${f.active === false ? 'off' : 'on'})`)};
  }
  if ((found.active !== false) === on) return {error: `${found.name} is already ${on ? 'on' : 'off'}`};
  return act(service, `turn ${found.name} ${on ? 'on' : 'off'}`, () => {
    service.setFeatureActive(found, on);
    const own = service.rawFeature(found);
    return {done: `${found.name} is ${on ? 'on' : 'off'}`, ...(own.charges ? {charges: {...own.charges}} : {})};
  });
};

export const useCharges = (service: ApplyCharacterService, name: unknown, uses: unknown = 1): ActionResult => {
  const count = uses === undefined ? 1 : amountOf(uses);
  if (!(count > 0)) return {error: 'the uses are a whole number above 0'};
  const charged = playFeatures(service).filter(f => f.charges);
  const {found, matches} = byName(charged, String(name ?? ''), f => f.name);
  if (!found || !found.charges) {
    return {error: matches.length ? `"${name}" could be ${matches.map(f => f.name).join(', ')}` : `the character has no feature "${name}" with uses`,
      features: charged.map(f => `${f.name} (${f.charges!.current}/${f.charges!.total} ${f.charges!.label || 'uses'})`)};
  }
  const charges = found.charges;
  if (charges.current < count) return {error: `${found.name} has ${charges.current} of ${charges.total} ${charges.label || 'uses'} left`};
  return act(service, `use ${found.name}${count > 1 ? ` x${count}` : ''}`, () => {
    service.useFeatureCharges(found, count);
    return {done: `used ${found.name}${count > 1 ? ` ${count} times` : ''}`, charges: {...service.rawFeature(found).charges!}};
  });
};

export const setCombatOption = (service: ApplyCharacterService, option: unknown, on: unknown): ActionResult => {
  const options = Object.keys(combatOptionLabels) as CombatOption[];
  const wanted = lower(option).replace(/[\s_-]/g, '');
  const found = options.find(o => o.toLowerCase() === wanted || combatOptionLabels[o].toLowerCase().replace(/[\s_-]/g, '') === wanted);
  if (!found) return {error: `there is no combat option "${option}"`, options: options.map(o => combatOptionLabels[o])};
  const applied = service.applied();
  const turnOn = on !== false && on !== 'false';
  if (turnOn && !alwaysAvailableCombatOptions.includes(found) && !applied.availableCombatOptions?.[found]) {
    return {error: `the character can not use ${combatOptionLabels[found]} (no feature gives it)`};
  }
  if (Boolean(applied.combatOptions?.[found]) === turnOn) return {error: `${combatOptionLabels[found]} is already ${turnOn ? 'on' : 'off'}`};
  return act(service, `${combatOptionLabels[found]} ${turnOn ? 'on' : 'off'}`, () => {
    const raw = service.raw();
    const excluded = turnOn ? Object.fromEntries(excludedCombatOptions(found).map(other => [other, false])) : {};
    service.update({combatOptions: {...defaultCombatOptions(), ...raw.combatOptions, ...excluded, [found]: turnOn}});
    return {done: `${combatOptionLabels[found]} is ${turnOn ? 'on' : 'off'}`};
  });
};

interface KnownSpell {type: SpellCastingType, origin: string, level: number, spell: Spell}

const knownSpells = (service: ApplyCharacterService): KnownSpell[] => {
  const applied = service.applied();
  return (['spells', 'spellLikeAbilities'] as SpellCastingType[]).flatMap(type =>
    Object.entries(applied[type] || {}).flatMap(([origin, caster]) =>
      (caster?.spells || []).flatMap((level, index) => (level?.spells || []).map(spell => ({type, origin, level: index, spell})))));
};

export const castSpell = (
  service: ApplyCharacterService, name: unknown,
  options: {caster?: unknown, level?: unknown, onSelf?: unknown, metamagic?: unknown, heightenedTo?: unknown} = {},
): ActionResult => {
  let spells = knownSpells(service).filter(s => lower(s.spell.name) === lower(name));
  if (!spells.length) spells = knownSpells(service).filter(s => lower(name) && lower(s.spell.name).includes(lower(name)));
  if (options.caster) spells = spells.filter(s => lower(s.origin) === lower(options.caster));
  if (options.level !== undefined && options.level !== null && options.level !== '') spells = spells.filter(s => s.level === amountOf(options.level));
  if (!spells.length) return {error: `the character has no spell "${name}"${options.caster ? ` as ${options.caster}` : ''}`, spells: knownSpells(service).map(s => `${s.spell.name} (${s.origin} ${s.level})`)};
  const casters = new Set(spells.map(s => `${s.origin} level ${s.level}`));
  if (casters.size > 1) return {error: `"${name}" is known more than once, say which: ${[...casters].join(', ')}`};
  const {type, origin, level, spell} = spells[0];
  const onSelf = options.onSelf === true || options.onSelf === 'true';
  // metamagic (rules/metamagic.ts): a prepared caster casts the copy it prepared with it, in its higher slot; a
  // spontaneous one spends a slot the metamagic raises the spell to
  const metamagic = (Array.isArray(options.metamagic) ? options.metamagic.map(String) : String(options.metamagic ?? '').split(','))
    .map(m => m.trim()).filter(Boolean);
  const caster = service.applied()[type][origin];
  let castLevel = level;
  let preparedIndex: number | undefined;
  if (metamagic.length && caster?.casting === 'prepared') {
    const same = (a: string[] = []) => a.length === metamagic.length && a.every(m => metamagic.some(n => lower(n) === lower(m)));
    const found = (caster.spells || []).flatMap((l, i) => (l?.prepared || []).map((p, j) => ({p, i, j})))
      .find(({p}) => lower(p.name) === lower(spell.name) && same(p.metamagic) && !p.cast);
    if (!found) return {error: `${spell.name} is not prepared with ${metamagic.join(', ')}: prepare_spells with metamagic first`};
    castLevel = found.i;
    preparedIndex = found.j;
  }
  return act(service, `cast ${spell.name}`, () => {
    const result = service.cast(type, origin, castLevel, spell, {onSelf, preparedIndex,
      ...(metamagic.length && caster?.casting !== 'prepared' ? {metamagic, heightenedTo: amountOf(options.heightenedTo) || undefined} : {})});
    const slots = service.applied()[type][origin]?.spells?.[result.level]?.perDay;
    return {
      ...(result.spent ? {done: `cast ${spell.name}${result.success ? '' : ' (it failed)'}`} : {error: `${spell.name} was not cast: ${result.reason || 'no slot left'}`}),
      cast: result,
      ...(slots ? {slotsLeft: `${slots.current} of ${slots.total} level ${result.level} ${origin} slots`} : {}),
      ...(result.note ? {how: result.note} : {}),
      ...(onSelf && result.success && spell.adjustments ? {note: 'its adjustments are on the character now'} : {}),
      ...(result.warning ? {warning: `${result.warning}: tell the player`} : {}),
    };
  });
};

export const rest = (service: ApplyCharacterService, kind: unknown = 'night'): ActionResult => {
  const restKind: RestKind = lower(kind).includes('bed') ? 'bedRest' : 'night';
  const before = hpNow(service);
  const summary = service.rest({kind: restKind, longTermCare: false});
  if (!summary.rested) return {error: 'the character could not rest', summary};
  // what came back in words, as the sheet says it: only what is in it changed
  return {
    done: restKind === 'bedRest' ? 'rested a full day in bed' : 'rested for the night',
    whatChanged: restSummaryText(summary) || 'nothing: the character was already rested',
    before, after: hpNow(service),
  };
};

export const undoLast = (service: ApplyCharacterService): ActionResult => {
  const undone = service.undo();
  return undone ? {done: `undid ${undone}`, hp: hpNow(service)} : {error: 'there is nothing to undo'};
};
