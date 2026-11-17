import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {RuleModule} from './rule-module';
import {abilityScore, damageCondition} from './ability-damage';

// the lethal damage the character took. the character keeps the damage and not its current hp, so a fresh character
// is at full hp and its current hp follows its max hp (Con damage, a toughness feat, ...)
// characters saved before that kept their current hp, which every character started out with at 0: so 0 stands for
// an untouched character, anything else for the damage that took it there from its max hp
export const damageTaken = (raw: Character, maxHp: number): number => {
  if (raw.damageTaken !== undefined && raw.damageTaken !== null) return Math.max(0, Number(raw.damageTaken) || 0);
  const currentHp = Number(raw.currentHp) || 0;
  return currentHp ? Math.max(0, maxHp - currentHp) : 0;
};

const isStableCondition = (c: Feature | undefined): boolean => (c?.name || '').trim().toLowerCase() === 'stable';

const isUnder = (raw: Character, condition: string): boolean =>
  (raw.conditions || []).some(c => c && c.active !== false && (c.name || '').trim().toLowerCase() === condition);

// a dying character is stable once it was stabilized (the stable flag), or by the Stable condition added by hand
// (how characters were stabilized before the flag)
export const isStable = (raw: Character): boolean => Boolean(raw.stable) || isUnder(raw, 'stable');

// the change that stabilizes the character or makes it dying again. making it dying again also takes off a Stable
// condition added by hand, it would keep the character stable
export const stabilityChange = (raw: Character, stable: boolean): Partial<Character> =>
  stable || !(raw.conditions || []).some(isStableCondition)
    ? {stable}
    : {stable, conditions: (raw.conditions || []).filter(c => !isStableCondition(c))};

// the change that leaves the character with that current hp, the character keeps the damage that leaves it with it.
// below 0 hp, healing of any kind stabilizes a dying character and further damage makes a stable one dying again.
// healed to 0 hp or more it is no longer dying, so it is no longer stable either
// (core rulebook, injury and death, dying and stable characters and recovery)
export const currentHpChange = (raw: Character, applied: Character, currentHp: number): Partial<Character> => {
  const change: Partial<Character> = {damageTaken: Math.max(0, applied.hp - currentHp)};
  const stable = isStable(raw);
  if (currentHp >= 0 || currentHp < applied.currentHp) {
    if (stable) Object.assign(change, stabilityChange(raw, false));
  } else if (currentHp > applied.currentHp && !stable) {
    Object.assign(change, stabilityChange(raw, true));
  }
  return change;
};

const fromHitPoints = (name: string, reason: string): Feature =>
  new Feature({...damageCondition(name, reason), source: 'from hit points'});
const fromNonlethal = (name: string, reason: string): Feature =>
  new Feature({...damageCondition(name, reason), source: 'from nonlethal damage'});

// what the character's current hp put it under (core rulebook, injury and death): disabled at 0 hp, dying below 0
// unless it is stable (see isStable), dead at a negative amount equal to its Con score. its Con score is its drained score, damage
// lowers its Con modifier (and so its max hp) but not the score
// nonlethal damage equal to its current hp staggers it, more than its current hp knocks it unconscious
// a character without hit points (no hit dice yet) can not be wounded, it is under none of them until it is
export const hitPointConditions = (raw: Character, applied: Character): Feature[] => {
  const taken = applied.damageTaken || 0;
  if (applied.hp <= 0 && !taken) return [];
  const currentHp = applied.currentHp;
  const con = abilityScore(raw, applied, 'con');
  const conditions: Feature[] = [];
  if (currentHp <= -con) conditions.push(fromHitPoints('Dead', `${currentHp} hp, at or below -${con} (Con)`));
  else if (currentHp < 0 && isStable(raw)) conditions.push(fromHitPoints('Stable', `${currentHp} hp, stabilized`));
  else if (currentHp < 0) conditions.push(fromHitPoints('Dying', `${currentHp} hp`));
  else if (currentHp === 0) conditions.push(fromHitPoints('Disabled', '0 hp'));

  const nonlethal = Math.max(0, Number(raw.nonlethalDamage) || 0);
  if (nonlethal && nonlethal > currentHp) {
    conditions.push(fromNonlethal('Unconscious', `${nonlethal} nonlethal damage > ${currentHp} hp`));
  } else if (nonlethal && nonlethal === currentHp) {
    conditions.push(fromNonlethal('Staggered', `${nonlethal} nonlethal damage = ${currentHp} hp`));
  }
  return conditions;
};

export const damageTakenRule: RuleModule = {
  name: 'damage taken',
  // max hp is final by now, current hp follows it
  finalize: (raw, applied) => {
    applied.damageTaken = damageTaken(raw, applied.hp);
    applied.currentHp = applied.hp - applied.damageTaken;
  },
  finalConditions: hitPointConditions,
};
