import type {AdjustmentMapEntry} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {Attack, AttackPart} from '../utils/attack.class';
import {Item} from '../utils/item.class';
import {evaluateVal, isCalculatedString} from '../utils/object.util';
import {clampSize} from '../utils/size.util';

// the attacks the features of an item give (its melee and ranged adjustments) are marked with the item's id, so the
// rules know the weapon behind an attack (its proficiency, ...). works on the applied character's copy of the item
// only, an attack that already names its item keeps it. gives back the item's features
export const tagItemAttacks = (item: Item): Item['features'] => {
  for (const feature of item.features || []) {
    for (const [key, value] of Object.entries(feature?.adjustments || {})) {
      if (!/^(melee|ranged)$/.test(key.replace(/\[[^\]]*\]$/, ''))) continue;
      for (const attack of Array.isArray(value) ? value : [value]) {
        if (attack && typeof attack === 'object' && !(attack as Attack).itemId) (attack as Attack).itemId = item.id;
      }
    }
  }
  return item.features || [];
};

// the number of attacks a manufactured weapon makes in a full attack from the base attack bonus: one more at +6,
// +11 and +16, four at most (core rulebook, combat, full attack)
export const iterativeAttackCount = (bab: number): number =>
  bab >= 16 ? 4 : bab >= 11 ? 3 : bab >= 6 ? 2 : 1;

// how often power attack and deadly aim take -1: once, and once more every 4 points of base attack bonus
// (-1 at bab 0-3, -2 at 4-7, ...)
export const powerAttackSteps = (bab: number): number => 1 + Math.floor(Math.max(0, bab) / 4);

// what is added to a strength modifier times a multiplier: a bonus is multiplied (rounded down), a penalty is not
export const multipliedModifier = (modifier: number, multiplier: number): number =>
  modifier > 0 ? Math.floor(modifier * multiplier) : modifier;

// the number an adjustment is worth, NaN for anything else (a whole attack, auto-fail, ...)
export const entryValue = (entry: AdjustmentMapEntry, char: Character): number => {
  if (typeof entry.value === 'number') return entry.value;
  if (isCalculatedString(entry.value)) {
    try { return evaluateVal(entry.value, char); } catch { return NaN; }
  }
  return NaN;
};

// what adjusted some paths, as parts. whatever of value the adjustments do not account for (the attack's own
// bonus, a set or bound, ...) is one more part named rest. variants are left out, they are shown as variants
export const partsOf = (
  entries: AdjustmentMapEntry[], value: number, char: Character, rest: string,
): AttackPart[] => {
  const parts: AttackPart[] = [];
  let sum = 0;
  for (const entry of entries) {
    if (entry.variant !== undefined || entry.mode) continue;
    const v = entryValue(entry, char);
    if (Number.isNaN(v)) continue;
    parts.push({value: v, origin: entry.origin, ...(entry.type ? {type: entry.type} : {}),
      ...(entry.overwritten ? {overwritten: true} : {})});
    if (!entry.overwritten) sum += v;
  }
  const remainder = (Number(value) || 0) - sum;
  if (remainder) parts.push({value: remainder, origin: rest});
  return parts;
};

export const totalOf = (parts: AttackPart[]): number =>
  parts.reduce((sum, part) => part.overwritten ? sum : sum + part.value, 0);

// the size the character is without effects changing it (enlarge person, ...), the size its weapons' dice are for:
// its final size less whatever added to the size, except what its race gives (a race usually sets the size, an older
// one may add to it). sets and bounds belong to the base size
export const baseSizeOf = (raw: Character, applied: Character, sizeEntries: AdjustmentMapEntry[] = []): number => {
  const raceOrigins = new Set((raw.race?.features || []).map(f => f?.name).filter(Boolean));
  let changes = 0;
  for (const entry of sizeEntries) {
    if (entry.mode || entry.variant !== undefined || entry.overwritten || raceOrigins.has(entry.origin)) continue;
    const v = entryValue(entry, applied);
    if (!Number.isNaN(v)) changes += v;
  }
  return clampSize((Number(applied.size) || 0) - changes);
};

// a weapon name or proficiency as compared: lower case, letters and digits only ("Great Axe" is "greataxe")
export const proficiencyKey = (name: string | undefined): string => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// what a damage roll is: the dice and the bonus ("2d6+9"), the bonus alone without dice
export const damageExpression = (dice: string, bonus: number): string => {
  const d = (dice || '').trim();
  if (!d) return String(bonus);
  if (!bonus) return d;
  return `${d}${bonus > 0 ? '+' : '-'}${Math.abs(bonus)}`;
};

export const criticalText = (crit: number, multiplier: number): string => {
  const threat = Number(crit) || 20;
  return `${threat < 20 ? `${threat}-20` : '20'}/x${Number(multiplier) || 2}`;
};
