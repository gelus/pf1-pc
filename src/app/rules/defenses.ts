import {DamageReduction} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {evaluateVal, getByPath, isCalculatedString, setByPath} from '../utils/object.util';
import type {AdjustmentMapEntry} from '../apply-character.service';
import {RuleContext, RuleModule} from './rule-module';

// Pathfinder 1e defenses that do not stack: damage reduction, energy resistance, spell resistance and concealment
// see https://www.d20pfsrd.com/gamemastering/special-abilities/ and https://www.d20pfsrd.com/gamemastering/combat/
// (concealment). when a character has one of them from several sources, only the best counts, so the engine adding
// them up is undone here: the best source is kept and the others are crossed out in the tooltips

type AdjustmentsMap = RuleContext['adjustmentsMap'];

// the adjustments that add to a value, the ones a feature gives without a mode
const addingEntries = (map: AdjustmentsMap, path: string): AdjustmentMapEntry[] =>
  (map[path] || []).filter(e => e.variant === undefined && !e.mode);

const numberOf = (value: any, char: Character): number =>
  typeof value === 'number' ? value : isCalculatedString(value) ? evaluateVal(value, char) : Number(value) || 0;

// the value of a defense given to paths (one path, or the spellings of one damage reduction, see normalizeBypass):
// only the highest value given to them applies, base (the character's own value) counting as one of them and a set
// replacing base. caps and floors still bound the result, the lowest cap first and then the highest floor. the
// adjustments that lose are crossed out. undefined when nothing adds to the paths, the engine's value then stands
const highestOf = (base: number, applied: Character, map: AdjustmentsMap, paths: string[]): number | undefined => {
  const entries = paths.flatMap(path => addingEntries(map, path)).filter(e => typeof e.value !== 'boolean');
  const lowers = paths.some(path => (map[path] || []).some(e => e.variant === undefined && e.mode === 'lower'));
  if (!entries.length && !lowers) return undefined;
  const others = paths.flatMap(path => (map[path] || []).filter(e => e.variant === undefined && e.mode));
  const set = others.filter(e => e.mode === 'set').pop();
  if (set) base = numberOf(set.value, applied);
  const best = entries.length ? entries.reduce((a, e) => (numberOf(e.value, applied) > numberOf(a.value, applied) ? e : a)) : undefined;
  const bestValue = best ? numberOf(best.value, applied) : base;
  for (const e of entries) e.overwritten = e !== best || base > bestValue;

  let value = Math.max(base, bestValue);
  const caps = others.filter(e => e.mode === 'min').map(e => numberOf(e.value, applied));
  const floors = others.filter(e => e.mode === 'max').map(e => numberOf(e.value, applied));
  if (caps.length) value = Math.min(value, ...caps);
  if (floors.length) value = Math.max(value, ...floors);
  // (what lowers it, after the best is kept, to 0 at least)
  const lowered = others.filter(e => e.mode === 'lower').reduce((sum, e) => sum + numberOf(e.value, applied), 0);
  return Math.max(0, value - lowered);
};

// only the highest of the values given to path applies, see highestOf
export const keepHighest = (raw: Character, applied: Character, map: AdjustmentsMap, path: string): void => {
  const value = highestOf(Number(getByPath(raw, path)) || 0, applied, map, [path]);
  if (value !== undefined) setByPath(applied, path, value);
};

// what overcomes damage reduction is free text, compared in lowercase. '-' (or a dash, or nothing) stands for
// DR x/—, which nothing overcomes. a combination keeps the words of the rules: 'good and silver' is overcome only by
// a weapon that is both, 'cold iron or silver' by a weapon that is either. the parts of a combination are sorted, so
// 'silver and good' and 'good and silver' are the same damage reduction and do not stack
export const normalizeBypass = (bypass: string | undefined): string => {
  const text = String(bypass ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text || /^[-–—]$/.test(text)) return '-';
  for (const joiner of [' and ', ' or ']) {
    if (text.includes(joiner)) return text.split(joiner).map(s => s.trim()).sort().join(joiner);
  }
  return text;
};

export const bypassLabel = (bypass: string): string => (bypass === '-' ? '—' : bypass);

// damage reduction is kept by what overcomes it, like energy resistance by energy: a feature gives DR 5/magic with
// 'damageReduction.magic': 5 and DR 10/— with 'damageReduction.-': 10 (plain numbers, typed bonuses, modes, if and
// unless, formulas: whatever any other path takes). a path is split at its dots, so a bypass cannot hold one
const DR_PREFIX = 'damageReduction.';

const isOldDamageReduction = (value: any): value is {value: any, bypass?: string} =>
  !!value && typeof value === 'object' && !Array.isArray(value) && 'bypass' in value;

// damage reduction keyed by its normalized bypass. a character saved before damage reduction was kept by bypass has
// a list of {value, bypass}. the highest value of a bypass is kept, they would not stack
export const damageReductionMap = (dr: any): DamageReduction => {
  const map: DamageReduction = {};
  const add = (bypass: string | undefined, value: any) => {
    const key = normalizeBypass(bypass);
    const n = Number(value) || 0;
    if (!(key in map) || n > map[key]) map[key] = n;
  };
  if (Array.isArray(dr)) {
    for (const old of dr) if (old && typeof old === 'object') add(old.bypass, old.value);
  } else if (isOldDamageReduction(dr)) {
    add(dr.bypass, dr.value);
  } else if (dr && typeof dr === 'object') {
    for (const [bypass, value] of Object.entries(dr)) add(bypass, value);
  }
  return map;
};

// a feature saved before damage reduction was kept by bypass gave it as damageReduction: {value, bypass}, a list of
// them, or either wrapped ({value: {value, bypass}, if: 'Rage'}). those become 'damageReduction.<bypass>'
// adjustments, the wrapper wrapping each of them. damageReduction: {magic: 5} gives every bypass of it the same way.
// adjustments without any of these come back as they are
export const migrateDamageReductionAdjustments = <T extends {[key: string]: any}>(adjustments: T): T => {
  if (!adjustments || typeof adjustments !== 'object' || !('damageReduction' in adjustments)) return adjustments;
  const old = adjustments['damageReduction'];
  const wrapped = !!old && typeof old === 'object' && !Array.isArray(old) && !('bypass' in old) && 'value' in old &&
    (isOldDamageReduction(old.value) || Array.isArray(old.value));
  const inner = wrapped ? old.value : old;
  const list: {value: any, bypass?: string}[] | undefined =
    Array.isArray(inner) ? inner.filter(isOldDamageReduction)
    : isOldDamageReduction(inner) ? [inner]
    : inner && typeof inner === 'object' && !('value' in inner)
      ? Object.entries(inner).map(([bypass, value]) => ({value, bypass}))
      : undefined;
  if (!list) return adjustments;

  const migrated: {[key: string]: any} = {};
  for (const [key, value] of Object.entries(adjustments)) {
    if (key !== 'damageReduction') {
      migrated[key] = value;
      continue;
    }
    for (const dr of list) {
      const path = DR_PREFIX + normalizeBypass(dr.bypass);
      const current = wrapped ? migrated[path]?.value : migrated[path];
      // two of one bypass would not stack, the higher is kept
      if (path in migrated && (Number(current) || 0) >= (Number(dr.value) || 0)) continue;
      migrated[path] = wrapped ? {...old, value: dr.value} : dr.value;
    }
  }
  return migrated as T;
};

// a saved character's own damage reduction and that of every feature in it (anything with adjustments, the features
// other features give included) are migrated, see damageReductionMap and migrateDamageReductionAdjustments
export const migrateDamageReduction = (char: any): void => {
  if (!char || typeof char !== 'object') return;
  char.damageReduction = damageReductionMap(char.damageReduction);
  const seen = new Set<any>();
  const walk = (value: any) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value.adjustments && typeof value.adjustments === 'object' && !Array.isArray(value.adjustments)) {
      value.adjustments = migrateDamageReductionAdjustments(value.adjustments);
    }
    Object.values(value).forEach(walk);
  };
  walk(char);
};

// the paths giving damage reduction, the character's own included, grouped by their normalized bypass:
// 'damageReduction.silver and good' and 'damageReduction.good and silver' are one damage reduction
const damageReductionPaths = (raw: Character, map: AdjustmentsMap): Map<string, string[]> => {
  const groups = new Map<string, string[]>();
  const paths = new Set([
    ...Object.keys(damageReductionMap(raw.damageReduction)).map(bypass => DR_PREFIX + bypass),
    ...Object.keys(map).filter(path => path.startsWith(DR_PREFIX)),
  ]);
  for (const path of paths) {
    const bypass = normalizeBypass(path.slice(DR_PREFIX.length));
    groups.set(bypass, [...(groups.get(bypass) || []), path]);
  }
  return groups;
};

// the damage reductions of a character, the one nothing overcomes first, then the highest
export const damageReductionList = (dr: DamageReduction | undefined): {bypass: string, value: number}[] =>
  Object.entries(dr || {})
    .map(([bypass, value]) => ({bypass, value: Number(value) || 0}))
    .filter(({value}) => value > 0)
    .sort((a, b) => Number(b.bypass === '-') - Number(a.bypass === '-') || b.value - a.value);

export interface DamageReductionSource {
  bypass: string;
  value: number;
  mode?: string;
  origin: string;
  overwritten: boolean;
}

// where each damage reduction of the applied character comes from: its own (base) and what each feature gives,
// crossed out when a better one applies. to read once the character is applied, the rule crosses the losers out
export const damageReductionSources = (raw: Character, applied: Character, map: AdjustmentsMap): DamageReductionSource[] => {
  const base = damageReductionMap(raw.damageReduction);
  const groups = damageReductionPaths(raw, map);
  return damageReductionList(applied.damageReduction).flatMap(({bypass}): DamageReductionSource[] => {
    const entries = (groups.get(bypass) || []).flatMap(path => (map[path] || []).filter(e => e.variant === undefined));
    return [
      ...(base[bypass] ? [{bypass, value: base[bypass], origin: 'base', overwritten: entries.some(e => !e.mode && !e.overwritten)}] : []),
      ...entries.map(e => ({
        bypass,
        value: numberOf(e.value, applied),
        ...(e.mode ? {mode: e.mode} : {}),
        origin: e.origin,
        overwritten: e.overwritten,
      })),
    ];
  });
};

// immunities compare in lowercase, a feature can give several at once separated by commas
const splitImmunities = (value: any): string[] =>
  (Array.isArray(value) ? value : [value])
    .filter(v => typeof v === 'string')
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(Boolean);

export const dedupeImmunities = (immunities: string[]): string[] => {
  const seen = new Set<string>();
  return immunities.filter(i => {
    const key = i.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// what the character is immune to, the old free text (immune) first so a character saved with it keeps showing it.
// the free text is split at its commas and semicolons, unless they are in parentheses
export const allImmunities = (char: Character): string[] =>
  dedupeImmunities([
    ...String(char.immune || '').split(/[,;](?![^(]*\))/).map(i => i.trim()).filter(Boolean),
    ...(char.immunities || []),
  ]);

export const defensesRule: RuleModule = {
  name: 'defenses',
  finalize(raw, applied, {adjustmentsMap}) {
    for (const path of Object.keys(adjustmentsMap).filter(p => p.startsWith('energyResistance.'))) {
      keepHighest(raw, applied, adjustmentsMap, path);
    }
    keepHighest(raw, applied, adjustmentsMap, 'spellResistance');
    keepHighest(raw, applied, adjustmentsMap, 'concealment');
    keepHighest(raw, applied, adjustmentsMap, 'fastHealing');
    keepHighest(raw, applied, adjustmentsMap, 'regeneration');

    // damage reduction from different sources does not stack, the character gets the best one in a given situation.
    // so for each bypass only the highest is kept: DR 10/— and DR 5/magic both stay, DR 5/magic and DR 10/magic
    // leave DR 10/magic. the spellings of a bypass are merged into its normalized one, see normalizeBypass
    const base = damageReductionMap(raw.damageReduction);
    const engine = damageReductionMap(applied.damageReduction);
    const damageReduction: DamageReduction = {};
    for (const [bypass, paths] of damageReductionPaths(raw, adjustmentsMap)) {
      const value = highestOf(base[bypass] || 0, applied, adjustmentsMap, paths) ?? engine[bypass] ?? 0;
      if (value > 0) damageReduction[bypass] = value;
    }
    applied.damageReduction = Object.fromEntries(damageReductionList(damageReduction).map(dr => [dr.bypass, dr.value]));

    applied.immunities = dedupeImmunities(splitImmunities(applied.immunities));
  },
};
