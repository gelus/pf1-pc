import {parseJsonArg} from './json-arg';
import {normalizedFeature} from './mechanics';
import {ApplyCharacterService} from '../apply-character.service';
import {Charges, Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {itemsToUnequip} from '../utils/equipment.util';
import {Item, Slot} from '../utils/item.class';
import {describeAdjustments, isAttackAdjustment, slots} from './builders';
import {ActionResult} from './play-actions';
import {fromForm} from './feature-form';
import {gpToPurse, priceInGp} from '../utils/wealth.util';

// what the AI changes or removes of what the character already has: its features (feats, traits, conditions, class
// and racial features, the features of its items) and its items. it works on the raw character, the one that is
// saved, finds things by name (and by item, for an item's feature), checks what it writes like the builders do, and
// every change is one step of the undo history

export interface FoundFeature {
  feature: Feature;
  // where it is, for the AI and the player: "feats", "item (A Sick Hat)", "Barbarian level 1"
  where: string;
  // the list holding it, to remove it from
  list: Feature[];
  item?: Item;
}

const FEATURE_LISTS = ['feats', 'traits', 'drawbacks', 'conditions', 'specialAttack', 'defensiveAbilities', 'specialQuality'] as const;
const GIVEN = ['feats', 'traits', 'drawbacks', 'conditions', 'specialAttack', 'defensiveAbilities', 'specialQuality'] as const;

const lower = (value: unknown): string => (typeof value === 'string' ? value : '').trim().toLowerCase();
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// every feature of the raw character, with where it is: its lists, race, class levels, items, and the features those
// give through their adjustments (a class feature giving Rage)
export const rawFeatures = (service: ApplyCharacterService): FoundFeature[] => {
  const raw = service.raw();
  const found: FoundFeature[] = [];
  const add = (list: Feature[] | undefined, where: string, item?: Item) => {
    if (!Array.isArray(list)) return;
    for (const feature of list) {
      if (!feature || typeof feature !== 'object') continue;
      found.push({feature, where, list, ...(item ? {item} : {})});
      for (const key of GIVEN) {
        const given = feature.adjustments?.[key] as unknown;
        if (Array.isArray(given)) add(given as Feature[], `given by ${feature.name}`, item);
        else if (given && typeof given === 'object') add([given as Feature], `given by ${feature.name}`, item);
      }
    }
  };
  for (const list of FEATURE_LISTS) add((raw as any)[list], list);
  add(raw.race?.features, `race (${raw.race?.name || 'race'})`);
  (raw.classLevels || []).forEach((level, i) => add(level?.features, `${level?.name || 'class'} level ${i + 1}`));
  for (const item of raw.inventory || []) add(item?.features, `item (${item?.name})`, item);
  return found;
};

// a feature by name, and by the item it is on when the player names one: an error lists what there is
const findFeature = (service: ApplyCharacterService, name: unknown, item: unknown): {found?: FoundFeature, error?: ActionResult} => {
  let all = rawFeatures(service);
  if (text(item)) all = all.filter(f => f.item && lower(f.item.name) === lower(item));
  const exact = all.filter(f => lower(f.feature.name) === lower(name));
  const matches = exact.length ? exact : all.filter(f => lower(name) && lower(f.feature.name).includes(lower(name)));
  if (matches.length === 1) return {found: matches[0]};
  const list = (fs: FoundFeature[]) => fs.map(f => `${f.feature.name} (${f.where})`);
  if (matches.length > 1) return {error: {error: `"${name}" could be more than one, name the item or be exact`, matches: list(matches)}};
  return {error: {error: `the character has no feature "${name}"${text(item) ? ` on ${item}` : ''}`, features: list(all).slice(0, 80)}};
};

const findItem = (service: ApplyCharacterService, name: unknown): {found?: Item, error?: ActionResult} => {
  const items = service.raw().inventory || [];
  const exact = items.filter(i => lower(i.name) === lower(name));
  const matches = exact.length ? exact : items.filter(i => lower(name) && lower(i.name).includes(lower(name)));
  if (matches.length === 1) return {found: matches[0]};
  if (matches.length > 1) return {error: {error: `"${name}" could be ${matches.map(i => i.name).join(', ')}, be exact`}};
  return {error: {error: `the character has no item "${name}"`, items: items.map(i => i.name)}};
};

const parsedJson = parseJsonArg;

const problemsResult = (problems: ReturnType<typeof validateFeature>): ActionResult => ({
  error: 'nothing was changed: fix these problems and call again (get_adjustment_reference explains the paths)',
  problems: formatProblems(problems),
});

// the class a feature belongs to: a class level's feature, or the sheet entry one of them gives
const classOf = (service: ApplyCharacterService, feature: Feature): string | undefined =>
  (service.raw().classLevels || []).find(level => (level?.features || []).some(f =>
    f === feature || Object.values(f.adjustments || {}).some(v => v === (feature as unknown))))?.name;

export const editFeature = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const {found, error} = findFeature(service, args['name'], args['item']);
  if (!found) return error!;
  const {feature, where} = found;
  // the changes, worked out on a copy and checked before the feature itself changes
  const changed: Feature = JSON.parse(JSON.stringify(feature));
  const what: string[] = [];
  if (text(args['new_name'])) { changed.name = text(args['new_name']); what.push(`renamed to ${changed.name}`); }
  if (typeof args['description'] === 'string') { changed.description = args['description']; what.push('new description'); }
  const adjustments = parsedJson(args['adjustments'], 'adjustments');
  if (adjustments.error) return {error: adjustments.error};
  if (adjustments.value !== undefined) {
    if (typeof adjustments.value !== 'object' || Array.isArray(adjustments.value)) return {error: 'adjustments is an object of paths and values'};
    changed.adjustments = normalizedFeature({adjustments: adjustments.value}).adjustments;
    what.push(`adjusts ${describeAdjustments(changed.adjustments) || 'nothing'}`);
  }
  const total = Math.floor(Number(args['uses_total']));
  if (args['uses_total'] !== undefined && args['uses_total'] !== null && args['uses_total'] !== '') {
    if (total > 0) {
      const per = text(args['uses_per']);
      changed.charges = {
        ...(changed.charges || {label: 'uses'}), total, current: Math.min(changed.charges?.current ?? total, total),
        ...(text(args['uses_label']) ? {label: text(args['uses_label'])} : {}),
        ...(['day', 'encounter', 'none'].includes(per) ? {per: per as Charges['per']} : {}),
      } as Charges;
      what.push(`${total} ${changed.charges.label || 'uses'}`);
    } else {
      delete changed.charges;
      what.push('no uses');
    }
  }
  if (typeof args['can_turn_off'] === 'boolean') {
    if (args['can_turn_off']) changed.active ??= true;
    else delete changed.active;
    what.push(args['can_turn_off'] ? 'can be turned off' : 'always on');
  }
  // a number that grows, from the table of the rules: a class feature's with its class level, another's with the
  // character's (feature-form.ts)
  const grows = parsedJson(args['grows'], 'grows');
  if (grows.error) return {error: grows.error};
  const className = classOf(service, feature);
  let byLevel: string[] = [];
  if (grows.value !== undefined) {
    (changed as {grows?: unknown}).grows = grows.value;
    const level = (service.raw().classLevels || []).filter(l => lower(l.name) === lower(className)).length;
    const form = fromForm(changed, {level: className ? `{level.${className.trim().toLowerCase()}}` : '{level}', className,
      classLevel: level || 1, applied: service.applied()});
    if (form.problems.length) return {error: `nothing was changed: ${form.problems.join('; ')}`};
    byLevel = form.wrote;
    what.push('grows by level');
  }
  if (!what.length) return {error: 'say what to change: new_name, description, adjustments, grows, uses_total or can_turn_off'};
  const problems = validateFeature(changed, {reference: service.applied()}, changed.name || 'feature');
  if (hasErrors(problems)) return problemsResult(problems);
  return service.labelled(`edit ${feature.name}`, () => {
    for (const key of Object.keys(feature) as (keyof Feature)[]) if (!(key in changed)) delete feature[key];
    Object.assign(feature, changed);
    service.update();
    return {done: `changed ${feature.name} (${where}): ${what.join(', ')}`, ...(byLevel.length ? {byLevel, checkByLevel: 'the app wrote these from your table: check each against the rules'} : {})};
  });
};

export const removeFeature = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const {found, error} = findFeature(service, args['name'], args['item']);
  if (!found) return error!;
  const {feature, where, list} = found;
  if (where.startsWith('given by')) return {error: `${feature.name} is ${where}: change or remove that feature instead`};
  return service.labelled(`remove ${feature.name}`, () => {
    list.splice(list.indexOf(feature), 1);
    service.update();
    return {done: `removed ${feature.name} (${where})`};
  });
};

export const editItem = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const {found: item, error} = findItem(service, args['name']);
  if (!item) return error!;
  const changed: any = JSON.parse(JSON.stringify(item));
  const what: string[] = [];
  if (text(args['new_name'])) { changed.name = text(args['new_name']); what.push(`renamed to ${changed.name}`); }
  if (typeof args['description'] === 'string') { changed.description = args['description']; what.push('new description'); }
  for (const [field, label] of [['quantity', 'quantity'], ['weight', 'weight'], ['cost_gp', 'cost']] as const) {
    if (args[field] === undefined || args[field] === null || args[field] === '') continue;
    const value = field === 'cost_gp' ? priceInGp(args[field]) : Number(args[field]);
    if (!Number.isFinite(value)) continue;
    // the price in coins, all of it replaced (setting gp alone kept the old silver and copper)
    if (field === 'cost_gp') changed.cost = gpToPurse(value);
    else changed[field] = field === 'quantity' ? Math.max(0, Math.floor(value)) : value;
    what.push(field === 'cost_gp' ? `cost ${value} gp` : `${label} ${value}`);
  }
  const slot = text(args['slot']) as Slot;
  if (slot) {
    if (!slots.includes(slot)) return {error: `slot is one of ${slots.join(', ')}`};
    changed.slot = slot;
    what.push(`slot ${slot}`);
  }
  let note: string | undefined;
  const features = parsedJson(args['features'], 'features');
  if (features.error) return {error: features.error};
  if (features.value !== undefined) {
    const list = (Array.isArray(features.value) ? features.value : [features.value]).map((f: any) => normalizedFeature(f));
    changed.features = list.map((f: any) => {
      const {descriptionOnly, ...feature} = f ?? {};
      return new Feature({...feature, name: f?.name || changed.name, description: f?.description ?? '', adjustments: feature.adjustments ?? {}});
    });
    // a weapon keeps its attack: features written without it (the AI changed the description) would leave a weapon
    // that attacks with nothing
    const attacks = (features: Feature[]) => features.filter(f => Object.keys(f.adjustments || {}).some(isAttackAdjustment));
    if (item.type === 'weapon' && attacks(item.features || []).length && !attacks(changed.features).length) {
      changed.features = [...changed.features.filter((f: Feature) => Object.keys(f.adjustments || {}).length), ...JSON.parse(JSON.stringify(attacks(item.features)))];
      note = 'its attack was kept: the features given had none';
    }
    const everyAttack = (changed.features as Feature[]).flatMap(f => Object.keys(f.adjustments || {})).filter(p => /^(melee|ranged)\.\*\./.test(p));
    if (item.type === 'weapon' && everyAttack.length) {
      return {error: `nothing was changed: ${everyAttack.join(', ')} adjusts every attack of the character, not this weapon. Change the weapon's own attack (its toHitBonus, damageBonus) in its melee or ranged feature`};
    }
    what.push(`features: ${changed.features.map((f: Feature) => `${f.name} (${describeAdjustments(f.adjustments) || 'nothing'})`).join('; ') || 'none'}`);
  }
  if (typeof args['equipped'] === 'boolean') {
    changed.equipped = args['equipped'];
    if (changed.equipped && !item.equipped) {
      const conflicts = itemsToUnequip(changed, (service.raw().inventory || []).filter(i => i !== item));
      if (conflicts.length) {
        changed.equipped = false;
        note = `not equipped: ${conflicts.map(i => i.name).join(' and ')} would have to come off, equip it on the sheet`;
      }
    }
    if (changed.equipped !== item.equipped) what.push(changed.equipped ? 'equipped' : 'unequipped');
  }
  if (!what.length) return note ? {error: note} : {error: 'say what to change: new_name, description, quantity, weight, cost_gp, slot, equipped or features'};
  const problems = (changed.features as Feature[] || []).flatMap((f, i) =>
    validateFeature(JSON.parse(JSON.stringify(f)), {reference: service.applied()}, `${changed.name}.features[${i}]`));
  if (hasErrors(problems)) return problemsResult(problems);
  return service.labelled(`edit ${item.name}`, () => {
    Object.assign(item, changed);
    service.update();
    return {done: `changed ${item.name}: ${what.join(', ')}`, ...(note ? {note} : {})};
  });
};

export const removeItem = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const {found: item, error} = findItem(service, args['name']);
  if (!item) return error!;
  return service.labelled(`remove ${item.name}`, () => {
    service.update({inventory: (service.raw().inventory || []).filter(i => i !== item)});
    return {done: `removed ${item.name} from the inventory`};
  });
};
