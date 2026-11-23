import {Character} from '../utils/character.class';

// what the hit points of a character look like, for every place that shows them (the sheet's header and its sticky
// header, the hit points dialog, a companion's side bar entry): the bar's parts as percents of the max hp, and a line
// that says them

export interface HpBarParts {
  current: number;
  temp: number;
  nonlethalFrom: number;
  nonlethal: number;
}

export const hpBarParts = (raw: Character, applied: Character): HpBarParts => {
  const max = Math.max(1, Number(applied.hp) || 0);
  const pct = (n: number) => Math.max(0, Math.min(100, n / max * 100));
  const current = Math.max(0, Math.min(max, Number(applied.currentHp) || 0));
  const nonlethal = Math.min(current, Math.max(0, Number(raw.nonlethalDamage) || 0));
  return {current: pct(current), temp: pct(Number(applied.tempHp) || 0), nonlethalFrom: pct(current - nonlethal), nonlethal: pct(nonlethal)};
};

export const hpSummaryOf = (raw: Character, applied: Character): string => {
  const parts = [`${applied.currentHp} of ${applied.hp} hp`];
  if (applied.tempHp) parts.push(`${applied.tempHp} temporary`);
  if (raw.nonlethalDamage) parts.push(`${raw.nonlethalDamage} nonlethal`);
  return parts.join(', ');
};
