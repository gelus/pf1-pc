import {ApplyCharacterService} from '../apply-character.service';
import {MECHANICS_GUIDE} from './mechanics';
import {Adjustments, Charges, Feature} from '../interfaces/character.interface';
import {AdjustmentProblem, formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {itemsToUnequip} from '../utils/equipment.util';
import {
  ARMOR_CATEGORIES, Armor, ArmorCategory, Item, SHIELD_CATEGORIES, Shield, ShieldCategory, Slot, Weapon,
} from '../utils/item.class';
import {ActionResult} from './play-actions';
import {wasLookedUp} from './rules-lookup';

// what the AI builds and adds to the character from a description or the rules text it looked up: a feature (a
// custom condition, a feat, a trait, a special ability) or an item. what it writes is checked by the same validator
// as pf1.validate, against the character as it is, and refused with the problems when the engine would get it wrong,
// so the AI fixes it and tries again. what is added is one step of the undo history, like a play action

// the lists of the character a feature can be added to
export const featureLists = ['conditions', 'feats', 'traits', 'drawbacks', 'specialAttack', 'defensiveAbilities', 'specialQuality'] as const;
export type FeatureList = typeof featureLists[number];

const listNames: {[list in FeatureList]: string} = {
  conditions: 'condition', feats: 'feat', traits: 'trait', drawbacks: 'drawback', specialAttack: 'special attack',
  defensiveAbilities: 'defensive ability', specialQuality: 'special quality',
};

export const slots: Slot[] = ['head', 'headband', 'eyes', 'shoulders', 'neck', 'chest', 'body', 'armor', 'belt', 'wrists', 'hands', 'ring', 'feet', 'held', 'slotless'];
export const itemTypes = ['weapon', 'armor', 'shield', 'other'] as const;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// JSON the AI wrote as a string (tools take no free-form objects with every provider), or the object itself
const parsed = (value: unknown, what: string): {value?: any, error?: string} => {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') return {value};
  try {
    return {value: JSON.parse(value)};
  } catch (e) {
    return {error: `${what} is not valid JSON: ${(e as Error).message}`};
  }
};

// a short account of what adjustments do, for the chat: "+1 competence attackRollBonus, saves.will +2"
export const describeAdjustments = (adjustments: Adjustments | undefined): string => Object.entries(adjustments || {})
  .map(([path, value]: [string, any]) => {
    if (typeof value === 'number') return `${path} ${value >= 0 ? '+' : ''}${value}`;
    if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
      const v = value.value;
      return `${path} ${typeof v === 'number' && v >= 0 ? '+' : ''}${v}${value.type ? ` ${value.type}` : ''}${value.mode ? ` (${value.mode})` : ''}`;
    }
    if (path === 'melee' || path === 'ranged') {
      const attacks = Array.isArray(value) ? value : [value];
      return `${path} attack ${attacks.map((a: any) => `${a?.name || ''} ${a?.damage || ''}`.trim()).join(', ')}`;
    }
    return `${path} ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  })
  .join(', ');

const problemsResult = (problems: AdjustmentProblem[]): ActionResult => ({
  error: 'nothing was added: fix these problems and call again (get_adjustment_reference explains the paths)',
  problems: formatProblems(problems),
});

const warningsOf = (problems: AdjustmentProblem[]) => {
  const warnings = problems.filter(p => p.severity === 'warning');
  return warnings.length ? {warnings: formatProblems(warnings)} : {};
};

// where what the AI built comes from: the rules page it read, what the player described, or the AI's memory, which
// can be wrong (it mixes up editions and bonus types), so the player is told to check it
export const basedOnKinds = ['looked up', 'player description', 'own knowledge'] as const;
export type BasedOn = typeof basedOnKinds[number];

export const provenance = (args: {[name: string]: unknown}): {basedOn?: BasedOn, sourceUrl: string, error?: string} => {
  const basedOn = text(args['based_on']) as BasedOn;
  const sourceUrl = text(args['source_url']);
  if (!basedOnKinds.includes(basedOn)) return {sourceUrl, error: `based_on is one of ${basedOnKinds.join(', ')}`};
  if (basedOn === 'looked up' && !wasLookedUp(sourceUrl)) {
    return {sourceUrl, error: 'based_on "looked up" needs the source_url of a page look_up_rules found, read it with look_up_rules first'};
  }
  return {basedOn, sourceUrl};
};

export const describe = (description: string, basedOn: BasedOn, sourceUrl: string): string => {
  const source = basedOn === 'looked up' ? `Source: ${sourceUrl}`
    : basedOn === 'own knowledge' ? 'Built by the AI from memory, not looked up: check it against the rules.'
    : 'Built by the AI from the player\'s description.';
  return `${description}${description ? '\n\n' : ''}${source}`;
};

// the chat marks what the AI built from memory
export const unchecked = (basedOn: BasedOn): string => basedOn === 'own knowledge' ? ' (from memory, check it)' : '';

const chargesOf = (args: {[name: string]: unknown}): Charges | undefined => {
  const total = Math.floor(Number(args['uses_total']));
  if (!(total > 0)) return undefined;
  const per = text(args['uses_per']);
  return {
    total, current: total, label: text(args['uses_label']) || 'uses',
    ...(['day', 'encounter', 'none'].includes(per) ? {per: per as Charges['per']} : {}),
  };
};

export const createFeature = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const list = text(args['list']) as FeatureList;
  if (!featureLists.includes(list)) return {error: `list is one of ${featureLists.join(', ')}`};
  const name = text(args['name']);
  if (!name) return {error: 'the feature needs a name'};
  const {basedOn, sourceUrl, error} = provenance(args);
  if (error || !basedOn) return {error};
  const adjustments = parsed(args['adjustments'], 'adjustments');
  if (adjustments.error) return {error: adjustments.error};
  if (adjustments.value !== undefined && (typeof adjustments.value !== 'object' || Array.isArray(adjustments.value))) {
    return {error: 'adjustments is an object of paths and values, {"attackRollBonus": 1}'};
  }
  // its rules as adjustments: only a feature that changes no number is description only, and says why
  const descriptionOnly = text(args['description_only']);
  if (!Object.keys(adjustments.value || {}).length && !descriptionOnly) {
    return {error: `${name} adjusts nothing: write its rules as adjustments, or give description_only with why it changes no number`, how: MECHANICS_GUIDE};
  }
  const raw = service.raw();
  const existing = ((raw as any)[list] || []) as Feature[];
  if (existing.some(f => (f.name || '').toLowerCase() === name.toLowerCase())) {
    return {error: `the character already has the ${listNames[list]} ${name}`};
  }
  const charges = chargesOf(args);
  const feature = new Feature({
    name,
    description: describe(text(args['description']), basedOn, sourceUrl),
    adjustments: adjustments.value || {},
    // a condition or a feature that can be turned off (a buff, a stance) gets the toggle the sheet shows
    ...(list === 'conditions' || args['can_turn_off'] === true ? {active: true} : {}),
    ...(charges ? {charges} : {}),
  });
  const problems = validateFeature(JSON.parse(JSON.stringify(feature)), {reference: service.applied()}, name);
  if (hasErrors(problems)) return problemsResult(problems);
  const summary = describeAdjustments(feature.adjustments);
  return service.labelled(`add ${name}`, () => {
    service.consumeFeature({feature, destination: list});
    return {
      done: `added the ${listNames[list]} ${name}${unchecked(basedOn)}${summary ? `: ${summary}` : ''}`,
      ...warningsOf(problems),
    };
  });
};

// the item to start from: a weapon, armor or shield comes with the fields of its kind
const baseItem = (type: string): Item => {
  if (type === 'weapon') return new Weapon();
  if (type === 'armor') return new Armor();
  if (type === 'shield') return new Shield();
  return new Item();
};

export const createItem = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const name = text(args['name']);
  if (!name) return {error: 'the item needs a name'};
  const {basedOn, sourceUrl, error} = provenance(args);
  if (error || !basedOn) return {error};
  const type = text(args['type']) || 'other';
  if (!(itemTypes as readonly string[]).includes(type)) return {error: `type is one of ${itemTypes.join(', ')}`};
  const features = parsed(args['features'], 'features');
  if (features.error) return {error: features.error};
  const given = features.value === undefined ? undefined : Array.isArray(features.value) ? features.value : [features.value];

  const item: any = baseItem(type);
  item.name = name;
  item.type = type;
  item.description = describe(text(args['description']), basedOn, sourceUrl);
  const slot = text(args['slot']) as Slot;
  if (slot) {
    if (!slots.includes(slot)) return {error: `slot is one of ${slots.join(', ')}`};
    item.slot = slot;
  }
  const number = (field: string): number | undefined => {
    const value = Number(args[field]);
    return args[field] === undefined || args[field] === null || args[field] === '' || !Number.isFinite(value) ? undefined : value;
  };
  item.weight = number('weight') ?? item.weight;
  item.quantity = Math.max(1, Math.floor(number('quantity') ?? 1));
  item.cost.gp = number('cost_gp') ?? 0;
  if (number('hands') !== undefined) item.hands = Math.max(0, Math.floor(number('hands')!));
  if (text(args['proficiency'])) item.proficiency = text(args['proficiency']);
  const armorCategory = text(args['armor_category']);
  if (type === 'armor' && armorCategory) {
    if (!ARMOR_CATEGORIES.includes(armorCategory as ArmorCategory)) return {error: `armor_category is one of ${ARMOR_CATEGORIES.join(', ')}`};
    item.armorCategory = armorCategory;
  }
  const shieldCategory = text(args['shield_category']);
  if (type === 'shield' && shieldCategory) {
    if (!SHIELD_CATEGORIES.includes(shieldCategory as ShieldCategory)) return {error: `shield_category is one of ${SHIELD_CATEGORIES.join(', ')}`};
    item.shieldCategory = shieldCategory;
  }
  // the features the AI wrote replace the template ones of a weapon, armor or shield (an attack, an armor bonus)
  if (given) item.features = given.map((f: any) => new Feature({...f, name: f?.name || name, description: f?.description ?? ''}));

  const problems = (item.features as Feature[]).flatMap((feature, i) =>
    validateFeature(JSON.parse(JSON.stringify(feature)), {reference: service.applied()}, `${name}.features[${i}]`));
  if (hasErrors(problems)) return problemsResult(problems);

  // equipping it takes nothing else off: what it would take off stays on, and the player equips it
  const raw = service.raw();
  let note: string | undefined;
  if (args['equip'] === true) {
    const conflicts = itemsToUnequip(Object.assign(item, {equipped: true}), raw.inventory || []);
    if (conflicts.length) {
      item.equipped = false;
      note = `it is not equipped: ${conflicts.map(i => i.name).join(' and ')} would have to come off, equip it on the sheet`;
    }
  }
  const summary = (item.features as Feature[]).map(f => describeAdjustments(f.adjustments)).filter(Boolean).join('; ');
  return service.labelled(`add ${name}`, () => {
    service.update({inventory: [...(raw.inventory || []), item]});
    return {
      done: `added ${item.quantity > 1 ? `${item.quantity} ` : ''}${name}${item.equipped ? ' (equipped)' : ''}${unchecked(basedOn)}${summary ? `: ${summary}` : ''}`,
      ...(note ? {note} : {}),
      ...(item.equipped || !(item.features as Feature[]).length ? {} : {reminder: 'its features apply only while it is equipped'}),
      ...warningsOf(problems),
    };
  });
};
