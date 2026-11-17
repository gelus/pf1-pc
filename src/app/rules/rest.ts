import {ChargesPer, Feature, chargesPer} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';
import {ConditionsService} from '../conditions.service';
import {ABILITIES, Ability, abilityLabel, abilityScore, pointsOf} from './ability-damage';
import {damageTaken, hitPointConditions} from './damage-taken';
import {SpellCastingType, rawSpellLevelSources, restSpellLevel} from './spell-sources';

// a rest (Core Rulebook, combat chapter: injury and death, natural healing, healing nonlethal damage; ability score
// damage, penalty and drain in the glossary; the Heal skill, long-term care; the glossary, fatigued and exhausted):
//
//  natural healing: a night's rest (8 hours of sleep) heals 1 hp per character level, complete bed rest for a full
//    day (24 hours) twice that. long-term care (a successful DC 15 Heal check of a caregiver, Heal skill) doubles both:
//    2 hp per level for a night, 4 for a day of bed rest
//  nonlethal damage heals at 1 hp per character level every hour: 8 × level for a night, 24 × level for a day.
//    long-term care does not change it (the Heal skill only doubles hp and ability damage)
//  ability damage: 1 point of every damaged ability for a night of rest, 2 for a day of bed rest, doubled by
//    long-term care (2 and 4). ability drain never comes back by resting
//  daily resources: the spell slots of every caster (class casters, other casters and spell-like abilities) come back,
//    domain and school slots too, and prepared spells can be cast again: a prepared caster keeps what it prepared
//    (see restSpellLevel). charges that come back each day or each encounter (see chargesPer) are refilled
//  conditions: "after 8 hours of complete rest, fatigued characters are no longer fatigued" and "after 1 hour of
//    complete rest, an exhausted character becomes fatigued" (glossary). so a night (8 hours) ends fatigue and leaves
//    an exhausted character fatigued (it still needs 8 hours as fatigued after its first hour), a full day ends both.
//    only the conditions added to the raw character by hand are touched, those the rules or features give follow
//    what gives them
//  temporary hit points are left as they are: they come from effects that last as long as they do
//
// characters below 0 hp (injury and death, dying and stable characters and recovery):
//  dead: no rest. dying (below 0 hp, not stable): it is not resting, it is dying, so a rest does nothing at all, it has
//  to be stabilized first. stable: it is unconscious and only becomes conscious through hourly DC 10 Constitution checks
//  (with a penalty equal to its negative hp), and until it is conscious (tended) it does not recover hit points
//  naturally. the sheet does not roll those checks: a rest does not heal the lethal damage of a stable character, the
//  player rolls the checks and enters its hp, everything else a rest does (nonlethal and ability damage, which heal
//  with time, daily resources, fatigue) still happens, and the summary says so in its notes
//
// pure: works on a copy of the raw character, never changes the one it is given. applied is the character worked out
// from raw (the service's applied character), for its max hp, current hp and the spell levels of its casters

export type RestKind = 'night' | 'bedRest';
export const REST_KINDS: RestKind[] = ['night', 'bedRest'];
export const REST_HOURS: {[kind in RestKind]: number} = {night: 8, bedRest: 24};
export const REST_LABELS: {[kind in RestKind]: string} = {night: "Night's rest", bedRest: 'Full day of bed rest'};
// what each rest does, as the sheet explains it (core rulebook, natural healing and ability damage)
const restEffects = (perLevel: number, nonlethalPerLevel: number, abilityPoints: number): string =>
  `Heals ${perLevel} hp per character level, ${nonlethalPerLevel} nonlethal damage per character level and `
  + `${abilityPoints} point${abilityPoints === 1 ? '' : 's'} of damage to each damaged ability (never drain). `
  + 'Refills spell slots and daily charges.';
export const REST_DESCRIPTIONS: {[kind in RestKind]: string} = {
  night: `8 hours of rest. ${restEffects(1, 8, 1)} Ends fatigue, and exhaustion becomes fatigue.`,
  bedRest: `24 hours of complete bed rest. ${restEffects(2, 24, 2)} Ends fatigue and exhaustion.`,
};
export const LONG_TERM_CARE_DESCRIPTION = 'Long-term care doubles the hit points and ability damage healed.';
export const TEMPORARY_HP_NOTE = 'Temporary hit points are left as they are, they last as long as the effect that gave them.';

export interface RestOptions {
  kind: RestKind;
  // a caregiver made a DC 15 Heal check (long-term care): hp and ability damage come back twice as fast
  longTermCare?: boolean;
  // the condition templates (ConditionsService.list), for the Fatigued an exhausted character becomes
  conditionTemplates?: Feature[];
  // the feature lists whose features add to casters (ApplyCharacterService.featureListLocations)
  featureListLocations?: string[];
}

export interface RestChargesChange {
  // where the feature is, as a path of the raw character ("classLevels.0.features", "feats", "inventory.2.features")
  location: string;
  id: string;
  name: string;
  per: ChargesPer;
  before: number;
  after: number;
  total: number;
}

export interface RestCasterChange {
  type: SpellCastingType;
  origin: string;
  name: string;
  // the uses per day that came back (all levels), the domain or school slots, the prepared spells that can be cast again
  slots: number;
  extraSlots: number;
  preparedSpells: number;
}

export interface RestConditionChange {
  name: string;
  change: 'removed' | 'reduced';
  // what a reduced condition became
  to?: string;
}

// what a rest did, for the sheet and for whatever reads it (an AI layer): every number is there, restSummaryText says it
export interface RestSummary {
  kind: RestKind;
  hours: number;
  longTermCare: boolean;
  // false when the character could not rest (blockedBy says why), the change is empty then
  rested: boolean;
  blockedBy?: 'dead' | 'dying';
  // current hp before and after at the max hp the character had (healing Con damage raises the max on top of that)
  hp: {before: number; after: number; healed: number; max: number};
  nonlethal: {before: number; after: number; healed: number};
  // the abilities whose damage went down
  abilityDamage: {ability: Ability; before: number; after: number}[];
  // the casters, those with nothing to restore included
  spellcasting: RestCasterChange[];
  // the charges that were refilled
  charges: RestChargesChange[];
  conditions: RestConditionChange[];
  notes: string[];
}

export interface RestResult {
  // what to update the raw character with (ApplyCharacterService.update), only the fields the rest changed
  change: Partial<Character>;
  summary: RestSummary;
}

const nameOf = (feature: Feature | undefined): string => (feature?.name || '').trim().toLowerCase();
const isActive = (feature: Feature | undefined): boolean => !!feature && feature.active !== false;

// the hp per character level a rest heals, see the rules above
export const restHpPerLevel = (kind: RestKind, longTermCare = false): number =>
  (kind === 'bedRest' ? 2 : 1) * (longTermCare ? 2 : 1);

// the points of every damaged ability a rest heals
export const restAbilityPoints = (kind: RestKind, longTermCare = false): number =>
  (kind === 'bedRest' ? 2 : 1) * (longTermCare ? 2 : 1);

// whether the character is dead or dying, so it can not rest
export const restBlockedBy = (raw: Character, applied: Character): 'dead' | 'dying' | undefined => {
  const names = hitPointConditions(raw, applied).map(nameOf);
  const conDamage = pointsOf(raw.abilityDamage, 'con');
  if (names.includes('dead') || (conDamage && conDamage >= abilityScore(raw, applied, 'con'))
    || (raw.conditions || []).some(c => isActive(c) && nameOf(c) === 'dead')) return 'dead';
  if (names.includes('dying')) return 'dying';
  return undefined;
};

// every list of features of the raw character that can hold charges, by its path
const featureListsOf = (char: Character): {location: string; features: Feature[]}[] => {
  const lists: {location: string; features: Feature[] | undefined}[] = [
    ...(char.classLevels || []).map((level, index) => ({location: `classLevels.${index}.features`, features: level?.features})),
    {location: 'race.features', features: char.race?.features},
    ...(['feats', 'specialAttack', 'conditions', 'traits', 'drawbacks', 'defensiveAbilities', 'specialQuality'] as const)
      .map(location => ({location, features: char[location] as Feature[] | undefined})),
    ...(char.inventory || []).map((item, index) => ({location: `inventory.${index}.features`, features: item?.features})),
  ];
  const found = lists.filter((list): list is {location: string; features: Feature[]} => Array.isArray(list.features));
  // the features given by an adjustment of a feature (a class feature giving Rage as a special attack) have charges
  // of their own, kept on the adjustment: they are lists too, and so are the ones they give in turn
  for (let i = 0; i < found.length; i++) {
    const {location, features} = found[i];
    features.forEach((feature, index) => {
      for (const key of GIVEN_FEATURE_LISTS) {
        const given = feature?.adjustments?.[key] as unknown;
        if (!given || typeof given !== 'object') continue;
        found.push({location: `${location}.${index}.adjustments.${key}`, features: (Array.isArray(given) ? given : [given]) as Feature[]});
      }
    });
  }
  return found;
};

// the adjustments that give features (see the features kind in adjustment-schema.ts)
const GIVEN_FEATURE_LISTS = ['feats', 'specialAttack', 'conditions', 'traits', 'drawbacks', 'defensiveAbilities', 'specialQuality'] as const;

// refills the daily and per-encounter charges of every feature, inactive ones and those of items not equipped too
// (a ring's 3/day comes back whether it is worn or not). changes the character it is given
const refillCharges = (char: Character): RestChargesChange[] => featureListsOf(char).flatMap(({location, features}) =>
  features.flatMap(feature => {
    const charges = feature?.charges;
    const per = chargesPer(charges);
    if (!charges || per === 'none') return [];
    const total = Number(charges.total) || 0;
    const before = Number(charges.current) || 0;
    if (before >= total) return [];
    charges.current = total;
    return [{location, id: feature.id, name: feature.name || '', per, before, after: total, total}];
  }));

const spellcastingTypes: SpellCastingType[] = ['spells', 'spellLikeAbilities'];

// refills every caster the applied character has, see restSpellLevel. counts what came back from the applied
// character and the raw one, then changes the copy it is given
const refillCasters = (raw: Character, applied: Character, copy: Character, locations?: string[]): RestCasterChange[] =>
  spellcastingTypes.flatMap(type => Object.entries(applied[type] || {}).map(([origin, caster]) => {
    const summary: RestCasterChange = {type, origin, name: caster?.name || origin, slots: 0, extraSlots: 0, preparedSpells: 0};
    (caster?.spells || []).forEach((level, index) => {
      if (!level) return;
      if (!level.atWill && level.perDay) summary.slots += Math.max(0, (Number(level.perDay.total) || 0) - (Number(level.perDay.current) || 0));
      if (level.extraSlot) summary.extraSlots += Math.max(0, level.extraSlot.total - level.extraSlot.current);
      summary.preparedSpells += rawSpellLevelSources(raw, type, origin, index, locations)
        .flatMap(source => source.prepared || [])
        .filter(prepared => prepared.cast).length;
      restSpellLevel(copy, type, origin, index, locations);
    });
    return summary;
  }));

// rests the conditions added by hand, see the rules above. changes the character it is given
const restConditions = (char: Character, kind: RestKind, templates: Feature[]): RestConditionChange[] => {
  const conditions = char.conditions || [];
  const exhausted = conditions.filter(c => isActive(c) && nameOf(c) === 'exhausted');
  const fatigued = conditions.filter(c => isActive(c) && nameOf(c) === 'fatigued');
  if (!exhausted.length && !fatigued.length) return [];
  const changes: RestConditionChange[] = [];
  char.conditions = conditions.filter(c => !exhausted.includes(c) && !fatigued.includes(c));
  if (fatigued.length) changes.push({name: fatigued[0].name || 'Fatigued', change: 'removed'});
  if (exhausted.length && kind === 'bedRest') {
    changes.push({name: exhausted[0].name || 'Exhausted', change: 'removed'});
  } else if (exhausted.length) {
    const template = templates.find(c => nameOf(c) === 'fatigued');
    const fatigue = template
      ? new Feature(JSON.parse(JSON.stringify(template)))
      : new Feature({id: 'Fatigued', name: 'Fatigued', description: 'Fatigued', adjustments: {}, active: true});
    char.conditions.push(fatigue);
    changes.push({name: exhausted[0].name || 'Exhausted', change: 'reduced', to: fatigue.name});
  }
  return changes;
};

// the fields of the raw character a rest can change
const restFields = [
  'damageTaken', 'nonlethalDamage', 'abilityDamage', 'spells', 'spellLikeAbilities', 'classLevels', 'race', 'feats',
  'specialAttack', 'conditions', 'traits', 'drawbacks', 'defensiveAbilities', 'specialQuality', 'inventory',
] as const;

export const restChange = (raw: Character, applied: Character, options: RestOptions): RestResult => {
  const kind: RestKind = options.kind === 'bedRest' ? 'bedRest' : 'night';
  const longTermCare = !!options.longTermCare;
  const hours = REST_HOURS[kind];
  const level = characterLevel(raw);
  const taken = damageTaken(raw, applied.hp);
  const nonlethal = Math.max(0, Math.floor(Number(raw.nonlethalDamage) || 0));
  const currentHp = applied.hp - taken;
  const summary: RestSummary = {
    kind, hours, longTermCare, rested: false,
    hp: {before: currentHp, after: currentHp, healed: 0, max: applied.hp},
    nonlethal: {before: nonlethal, after: nonlethal, healed: 0},
    abilityDamage: [], spellcasting: [], charges: [], conditions: [], notes: [],
  };

  const blockedBy = restBlockedBy(raw, applied);
  if (blockedBy) {
    summary.blockedBy = blockedBy;
    summary.notes.push(blockedBy === 'dead'
      ? 'the character is dead, it can not rest'
      : 'the character is dying: it is not resting and heals nothing, stabilize it first');
    return {change: {}, summary};
  }
  summary.rested = true;

  const copy = JSON.parse(JSON.stringify(raw)) as Character;

  // lethal damage, not for a stable character below 0 hp
  if (currentHp < 0) {
    summary.notes.push('the character is stable below 0 hp: it heals no hit points naturally until it is conscious '
      + '(an hourly DC 10 Constitution check, with a penalty equal to its negative hit points), roll them and enter its hp');
  } else if (taken > 0) {
    const after = Math.max(0, taken - restHpPerLevel(kind, longTermCare) * level);
    copy.damageTaken = after;
    summary.hp.healed = taken - after;
    summary.hp.after = applied.hp - after;
  }

  // nonlethal damage heals with time, 1 hp per level every hour
  if (nonlethal > 0) {
    const after = Math.max(0, nonlethal - hours * level);
    copy.nonlethalDamage = after;
    summary.nonlethal = {before: nonlethal, after, healed: nonlethal - after};
  }

  // ability damage, never drain
  const points = restAbilityPoints(kind, longTermCare);
  const abilityDamage = {...(raw.abilityDamage || {})};
  for (const ability of ABILITIES) {
    const before = pointsOf(raw.abilityDamage, ability);
    if (!before) continue;
    const after = Math.max(0, before - points);
    abilityDamage[ability] = after;
    summary.abilityDamage.push({ability, before, after});
  }
  if (summary.abilityDamage.length) copy.abilityDamage = abilityDamage;

  summary.spellcasting = refillCasters(raw, applied, copy, options.featureListLocations);
  summary.charges = refillCharges(copy);
  summary.conditions = restConditions(copy, kind, options.conditionTemplates || new ConditionsService().list);

  if ((Number(applied.currentTempHp) || 0) > 0 || (Number(applied.tempHp) || 0) > 0) {
    summary.notes.push('temporary hit points are left as they are, they last as long as the effect that gave them');
  }

  const change: Partial<Character> = {};
  for (const field of restFields) {
    if (JSON.stringify(copy[field]) !== JSON.stringify(raw[field])) (change as any)[field] = copy[field];
  }
  return {change, summary};
};

const minus = '−';

// what the rest did, in a line: "+5 hp, +8 nonlethal, Str damage −1, slots refilled, Rage 0 → 3, Fatigued removed"
export const restSummaryText = (summary: RestSummary): string => {
  if (!summary.rested) return summary.notes[0] || 'no rest';
  const parts: string[] = [];
  if (summary.hp.healed) parts.push(`+${summary.hp.healed} hp`);
  if (summary.nonlethal.healed) parts.push(`+${summary.nonlethal.healed} nonlethal`);
  for (const {ability, before, after} of summary.abilityDamage) {
    parts.push(`${abilityLabel(ability)} damage ${minus}${before - after}`);
  }
  const refilled = summary.spellcasting.filter(c => c.slots || c.extraSlots || c.preparedSpells);
  if (refilled.length) {
    parts.push(summary.spellcasting.length > 1 ? `slots refilled (${refilled.map(c => c.name).join(', ')})` : 'slots refilled');
  }
  for (const charge of summary.charges) parts.push(`${charge.name} ${charge.before} → ${charge.after}`);
  for (const condition of summary.conditions) {
    parts.push(condition.change === 'removed' ? `${condition.name} removed` : `${condition.name} → ${condition.to}`);
  }
  if (summary.hp.before < 0 && !summary.hp.healed) parts.push('no hp (stable, below 0)');
  return parts.length ? parts.join(', ') : 'nothing to recover';
};
