import {Feature} from '../interfaces/character.interface';
import {Item} from '../utils/item.class';

// changing shape (Core Rulebook, chapter 9, transmutation: polymorph; the druid's wild shape is one): a form is a
// condition the player switches on and off, marked with what the form does (Feature.form). the engine holds to the
// polymorph rules, for any form of any spell:
//  - one at a time: the form switched on last is the one in effect
//  - the original form's natural attacks, movement types (other than its land speed) and senses are set aside for the
//    form's own: here the race's (its stats and traits are the original form)
//  - a form that melds the gear (an animal, elemental, plant, dragon or vermin form): armor and shields give no armor
//    or shield bonus and no penalties, weapons make no attacks, and what other items give constantly goes on
//  - a form with no hands or voice for spells casts none with verbal or somatic components, unless a feature lets it
//    (Natural Spell: "castsInAnyForm": true)
// what is set aside is kept on the applied character (setAside), so the sheet greys it out rather than hiding it

export interface FormRules {
  // the gear melds into the form
  meldsGear?: boolean;
  // only the armor it wears stops (a synthesist fused with its eidolon: the rest of its gear works)
  meldsArmor?: boolean;
  // the eidolon it is fused with (a synthesist's, by its id): its numbers are copied in by CharacterRegistry
  fusedWith?: string;
  // spells with verbal or somatic components can not be cast in it
  noCasting?: boolean;
  // the spell or feature it comes from ("Beast Shape II", "Wild Shape"), for the player
  from?: string;
}

// what a form set aside, on the applied character only
export interface SetAside {
  form: string;
  // the melded items, by id, and the attacks that went with them
  items: {id: string, name: string}[];
  attacks: string[];
  // what of the original form is set aside: "Darkvision (senses)", "Claws (natural attacks)"
  original: string[];
  // the form has no hands or voice for spells (FormRules.noCasting)
  noCasting?: boolean;
}

// a form's rules as given (the AI's JSON, the feature editor's fields): {"melds_gear": true, "no_casting": true,
// "from": "Beast Shape II"}, true for a form that does neither
export const formFrom = (value: unknown): FormRules | undefined => {
  let given = value;
  if (typeof given === 'string') {
    if (!given.trim() || /^(none|false|no)$/i.test(given.trim())) return undefined;
    try { given = JSON.parse(given); } catch { return {from: String(value).trim()}; }
  }
  if (given === true) return {};
  if (!given || typeof given !== 'object') return undefined;
  const g = given as {[key: string]: unknown};
  const flag = (...keys: string[]) => keys.some(k => g[k] === true || g[k] === 'true');
  const from = String(g['from'] ?? g['spell'] ?? '').trim();
  return {
    ...(flag('melds_gear', 'meldsGear') ? {meldsGear: true} : {}),
    ...(flag('no_casting', 'noCasting') ? {noCasting: true} : {}),
    ...(from ? {from} : {}),
  };
};

export const isForm = (feature: Feature | undefined): boolean => !!feature?.form && typeof feature.form === 'object';

// the form in effect among the conditions: the last one switched on, the others with it dropped
export const oneFormOnly = (conditions: Feature[]): {conditions: Feature[], form?: Feature} => {
  const forms = conditions.filter(c => isForm(c) && c.active !== false);
  const form = forms[forms.length - 1];
  return {conditions: conditions.filter(c => !isForm(c) || c === form), form};
};

const isNatural = (attack: unknown): boolean => !!attack && typeof attack === 'object' && (attack as {type?: unknown}).type === 'natural';
const OTHER_MOVEMENT = /^speed\.(climb|swim|fly|burrow)$|^flyManeuverability$/;

// a feature of the original form with its natural attacks, movement types and senses taken out, and what they were.
// physical: its Str, Dex and Con modifiers too (a synthesist fused with its eidolon has its eidolon's body)
const PHYSICAL = /^abilityScores\.(str|dex|con)$/;
export const withoutOriginalForm = (feature: Feature, physical = false): {feature: Feature, setAside: string[]} => {
  const adjustments: {[path: string]: unknown} = {};
  const setAside: string[] = [];
  for (const [path, value] of Object.entries(feature.adjustments || {})) {
    const plain = path.replace(/\[.*\]$/, '');
    if ((plain === 'melee' || plain === 'ranged')) {
      const attacks = ([] as unknown[]).concat(value);
      const kept = attacks.filter(a => !isNatural(a));
      if (kept.length < attacks.length) setAside.push(`${feature.name} (natural attacks)`);
      if (kept.length) adjustments[path] = Array.isArray(value) ? kept : kept[0];
      continue;
    }
    if (OTHER_MOVEMENT.test(plain)) { setAside.push(`${feature.name} (${plain.replace(/^speed\./, '')})`); continue; }
    if (plain === 'senses' || plain.startsWith('senses.')) { setAside.push(`${feature.name} (senses)`); continue; }
    if (physical && PHYSICAL.test(plain)) { setAside.push(`${feature.name} (${plain.replace(/^abilityScores\./, '')})`); continue; }
    adjustments[path] = value;
  }
  return {feature: setAside.length ? new Feature({...feature, adjustments: adjustments as Feature['adjustments']}) : feature, setAside: [...new Set(setAside)]};
};

// what melds: a weapon's attacks, armor's and a shield's bonus to AC and what they hold back (max Dex, check
// penalty, spell failure). the rest of what an item gives goes on
const MELDED = /^(melee|ranged|maxDexBonus|armorCheckPenalty|arcaneSpellFailureChance)$/;
const meldedAc = (value: unknown): boolean => !!value && typeof value === 'object'
  && /^(armor|shield)$/i.test(String((value as {type?: unknown}).type ?? ''));
// armor, a shield or a weapon, by its type or by what it is (an armor or shield category, an attack it makes): an item
// made without its type (an older save, the sheet's own) melds all the same
// armor it wears, by its type or its armor category
export const isArmor = (item: Item): boolean => String(item.type) === 'armor' || !!(item as {armorCategory?: unknown}).armorCategory;

export const meldsInto = (item: Item): boolean => ['weapon', 'armor', 'shield'].includes(String(item.type))
  || !!(item as {armorCategory?: unknown}).armorCategory || !!(item as {shieldCategory?: unknown}).shieldCategory
  || (item.features || []).some(f => Object.keys(f.adjustments || {}).some(path => /^(melee|ranged)(\[|$)/.test(path)));

// every item's: bracers of armor give no armor bonus in a form either, a cloak of resistance goes on. dropped: the item
// lost something to the form (the sheet greys it out)
export const meldedFeatures = (features: Feature[]): {features: Feature[], attacks: string[], dropped: boolean} => {
  const attacks: string[] = [];
  let dropped = false;
  const kept = features.map(feature => {
    const adjustments: {[path: string]: unknown} = {};
    for (const [path, value] of Object.entries(feature.adjustments || {})) {
      const plain = path.replace(/\[.*\]$/, '');
      if (plain === 'melee' || plain === 'ranged') {
        attacks.push(...([] as {name?: string}[]).concat(value as {name?: string}).map(a => a?.name || feature.name || 'an attack'));
        dropped = true;
        continue;
      }
      if (MELDED.test(plain) || (plain === 'ac' && meldedAc(value))) { dropped = true; continue; }
      adjustments[path] = value;
    }
    return new Feature({...feature, adjustments: adjustments as Feature['adjustments']});
  });
  return {features: kept, attacks, dropped};
};
