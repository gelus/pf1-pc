import {AbilityDamage, Feature, bonusStackingKey} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {evaluateVal, isCalculatedString} from '../utils/object.util';
import type {AdjustmentMapEntry} from '../apply-character.service';
import {RuleContext, RuleModule, conditionKey, ruleFeature} from './rule-module';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = typeof ABILITIES[number];

// a condition given by its name, so it takes its template, the description says what put the character under it
export const damageCondition = (name: string, reason: string): Feature =>
  new Feature({name, description: reason, adjustments: {}, active: true});

export const abilityLabel = (ability: Ability): string => ability[0].toUpperCase() + ability.slice(1);

// the points of damage or drain an ability took, whole and never negative
export const pointsOf = (points: AbilityDamage | undefined, ability: Ability): number =>
  Math.max(0, Math.floor(Number(points?.[ability]) || 0));

// the score of the ability as the rules see it: drained, and never lowered by its damage. ability damage does not
// change the score, it gives a -1 penalty for every 2 points of it to everything taking the ability's modifier
// (core rulebook, glossary, ability damage), see abilityModifier. so the applied score is that score
export const abilityScore = (_raw: Character, applied: Character, ability: Ability): number =>
  Number(applied.abilityScores?.[ability]) || 0;

const numberOf = (entry: AdjustmentMapEntry, applied: Character): number | undefined =>
  typeof entry.value === 'number' || isCalculatedString(entry.value) ? evaluateVal(entry.value, applied) : undefined;

// the score of the ability without what the conditions did to it: its raw score with every adjustment that is not
// a condition's (drain, ability increases, belts, ...). the thresholds of ability damage and drain compare with the
// character's actual score, a paralyzed character's Str and Dex are only effectively 0 (core rulebook, paralyzed:
// "effective Dexterity and Strength scores of 0"), the damage it takes is not compared with that 0
// what a condition did is told apart by the origin of its adjustments, the name of the condition (see
// RuleContext.conditionNames), the condition templates are left as they are. when no condition adjusted the score the
// applied score is exact. otherwise the score is worked out again from the other adjustments, the way the engine does:
// same-type bonuses do not stack (the larger applies), a set replaces the raw score (the last one wins), caps and
// floors come last. formulas are evaluated with the final character, which is as close as it gets this late
export const scoreWithoutConditions = (
  raw: Character, applied: Character, ability: Ability, context?: RuleContext,
): number => {
  const conditions = context?.conditionNames;
  const entries = (context?.adjustmentsMap[`abilityScores.${ability}`] || []).filter(entry => entry.variant === undefined);
  const byCondition = (entry: AdjustmentMapEntry) => !!conditions?.has(conditionKey(entry.origin));
  if (!entries.some(byCondition)) return abilityScore(raw, applied, ability);

  let score = Number(raw.abilityScores?.[ability]) || 0;
  let added = 0;
  const typed = new Map<string, number>();
  const caps: number[] = [];
  const floors: number[] = [];
  for (const entry of entries) {
    if (byCondition(entry)) continue;
    const value = numberOf(entry, applied);
    if (value === undefined || Number.isNaN(value)) continue;
    if (entry.mode === 'set') score = value;
    else if (entry.mode === 'min') caps.push(value);
    else if (entry.mode === 'max') floors.push(value);
    else {
      // bonuses of one type do not stack, see bonusStackingKey
      const type = bonusStackingKey(entry.type, entry.origin);
      if (type) typed.set(type, Math.max(typed.get(type) ?? -Infinity, value));
      else added += value;
    }
  }
  score += added + [...typed.values()].reduce((sum, value) => sum + value, 0);
  if (caps.length) score = Math.min(score, ...caps);
  if (floors.length) score = Math.max(score, ...floors);
  return score;
};

// what happens to a character whose score drops to 0 (core rulebook, chapter 1, each ability): too weak to move
// at all and unconscious at Str 0, immobile but not unconscious at Dex 0 (helpless), dead at Con 0, comatose at
// Int 0 and unconscious at Wis 0 and Cha 0
const atZero: {[ability in Ability]: string} = {
  str: 'Unconscious', dex: 'Helpless', con: 'Dead', int: 'Unconscious', wis: 'Unconscious', cha: 'Unconscious',
};

// ability damage equal to the score knocks the character unconscious until the damage is less than the score, but
// Con damage equal to the Con score kills it (glossary, ability damage). a score drained down to 0 has the effect of
// a score of 0. both compare with the score without what conditions did to it (see scoreWithoutConditions): a score
// at 0 because of a condition (a paralyzed character's Str and Dex) puts it under nothing here, its condition
// already says what it does
export const abilityDamageConditions = (raw: Character, applied: Character, context?: RuleContext): Feature[] =>
  ABILITIES.flatMap(ability => {
    const damage = pointsOf(raw.abilityDamage, ability);
    const drain = pointsOf(raw.abilityDrain, ability);
    if (!damage && !drain) return [];
    const score = scoreWithoutConditions(raw, applied, ability, context);
    const label = abilityLabel(ability);
    if (damage && damage >= score) {
      return [damageCondition(ability === 'con' ? 'Dead' : 'Unconscious', `${label} damage ${damage} ≥ ${label} ${score}`)];
    }
    if (drain && score <= 0) return [damageCondition(atZero[ability], `${label} drained to 0`)];
    return [];
  });

// lowers the scores by their drain, before any other feature so everything taking their modifiers (max hp from Con
// included) takes the lowered ones. ability damage leaves the score alone: its penalty is part of the ability's
// modifier wherever that is taken (see abilityModifier), so carrying capacity, prerequisites and the score shown
// keep the undamaged score
export const abilityDamageRule: RuleModule = {
  name: 'ability damage',
  base: (raw) => ABILITIES.flatMap(ability => {
    const drain = pointsOf(raw.abilityDrain, ability);
    return drain ? [ruleFeature(`${abilityLabel(ability)} drain (${drain})`, {[`abilityScores.${ability}`]: -drain})] : [];
  }),
  finalConditions: abilityDamageConditions,
};
