import {ApplyCharacterService} from '../apply-character.service';
import {mechanicsProblems, mechanicsRefusal, normalizedFeature} from './mechanics';
import {parseJsonArg, parseJsonList} from './json-arg';
import {availableFeats} from '../rules/class-progression';
import {Adjustments, Charges, Feature} from '../interfaces/character.interface';
import {AdjustmentProblem, formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {itemsToUnequip} from '../utils/equipment.util';
import {
  ARMOR_CATEGORIES, Armor, ArmorCategory, Item, SHIELD_CATEGORIES, Shield, ShieldCategory, Slot, Weapon,
} from '../utils/item.class';
import {MeleeAttack, RangeAttack} from '../utils/attack.class';
import {ActionResult} from './play-actions';
import {lookedUpUrlFor, rulesTextFor, wasLookedUp} from './rules-lookup';
import {fairPrice, hasOutfit, vagueItem} from './gear-prices';
import {fromForm} from './feature-form';
import {characterLevel} from '../utils/classlevel.class';
import {gpToPurse, priceInGp} from '../utils/wealth.util';

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
const parsed = parseJsonArg;

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

// a page found by name stands for what is built under that name: the AI often leaves its url out
export const provenance = (args: {[name: string]: unknown}, name?: string): {basedOn?: BasedOn, sourceUrl: string, error?: string} => {
  const basedOn = text(args['based_on']) as BasedOn;
  let sourceUrl = text(args['source_url']);
  if (!basedOnKinds.includes(basedOn)) return {sourceUrl, error: `based_on is one of ${basedOnKinds.join(', ')}`};
  if (basedOn === 'looked up' && !wasLookedUp(sourceUrl)) {
    const found = name ? lookedUpUrlFor(name) : undefined;
    if (!found) {
      return {sourceUrl, error: 'based_on "looked up" needs the source_url of a page look_up_rules found, read it with look_up_rules first'};
    }
    sourceUrl = found;
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

// a feat's prerequisites the character does not meet: ability scores, base attack bonus, feats and class features it
// names (Selective Channeling's Cha 13 was taken with Cha 11). what is written otherwise is left to the player
const ABILITY_NAMES: {[short: string]: string} = {str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha'};
export const unmetPrerequisites = (service: ApplyCharacterService, written: string): string[] => {
  const applied: any = service.applied();
  const unmet: string[] = [];
  const names = (features: Feature[] = []) => features.map(f => (f.name || '').toLowerCase());
  const has = new Set([
    ...names(applied.feats),
    ...(applied.classLevels || []).flatMap((l: {features?: Feature[]}) => names(l.features)),
    ...names(applied.specialAttack), ...names(applied.defensiveAbilities), ...names(applied.specialQuality),
    ...names(applied.race?.features),
  ]);
  for (const part of written.split(/[,;]|\band\b/).map(p => p.trim().replace(/\.$/, '')).filter(Boolean)) {
    const ability = /^(str|dex|con|int|wis|cha)[a-z]*\s+(\d+)$/i.exec(part);
    if (ability) {
      const key = ABILITY_NAMES[ability[1].toLowerCase()];
      const score = Number(applied.abilityScores?.[key]);
      if (score < Number(ability[2])) unmet.push(`${part} (the character has ${score})`);
      continue;
    }
    const bab = /^(base attack bonus|bab)\s*\+?(\d+)$/i.exec(part);
    if (bab) {
      if (Number(applied.bab) < Number(bab[2])) unmet.push(`${part} (the character has +${applied.bab})`);
      continue;
    }
    const classFeature = /^(.+?)\s+class (feature|ability)$/i.exec(part);
    const featName = /^[A-Z][\w'’-]*( [A-Z(][\w'’()-]*){0,4}$/.test(part) && !/\d/.test(part) ? part : undefined;
    const wanted = (classFeature?.[1] || featName || '').toLowerCase();
    if (wanted && ![...has].some(name => name.includes(wanted) || (wanted.length > 4 && wanted.includes(name) && name.length > 4))) {
      unmet.push(`${part} (the character does not have it)`);
    }
  }
  return unmet;
};

export const createFeature = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const list = text(args['list']) as FeatureList;
  if (!featureLists.includes(list)) return {error: `list is one of ${featureLists.join(', ')}`};
  const name = text(args['name']);
  if (!name) return {error: 'the feature needs a name'};
  // where it comes from, wrong or missing, is told with the rest of what is wrong
  const source = provenance(args, name);
  const basedOn = source.basedOn ?? 'own knowledge';
  const sourceUrl = source.sourceUrl;
  const sourceProblem = source.error || !source.basedOn ? [String(source.error || 'based_on is one of looked up, player description, own knowledge')] : [];
  const adjustments = parsed(args['adjustments'], 'adjustments');
  if (adjustments.error) return {error: adjustments.error};
  if (adjustments.value !== undefined && (typeof adjustments.value !== 'object' || Array.isArray(adjustments.value))) {
    return {error: 'adjustments is an object of paths and values, {"attackRollBonus": 1}'};
  }
  // its rules as adjustments: only a feature that changes no number is description only, and says why
  const written = normalizedFeature({
    name, description: text(args['description']), adjustments: adjustments.value || {},
    descriptionOnly: text(args['description_only']) || undefined,
    ...(list === 'conditions' || args['can_turn_off'] === true ? {active: true} : {}),
  });
  // a number that grows with the character's level, from the table the AI read (feature-form.ts)
  const grows = parsed(args['grows'], 'grows');
  if (grows.error) return {error: grows.error};
  if (grows.value !== undefined) written.grows = grows.value;
  const form = fromForm(written as Feature, {level: '{level}', applied: service.applied(), classLevel: characterLevel(service.raw()) || 1});
  // the rules its page gave, checked with its description, never stored (a page of one rule: all of it)
  const rules = rulesTextFor(sourceUrl, name, true);
  if (rules && basedOn === 'looked up') written.rulesText = rules;
  const mechanics = [...sourceProblem, ...form.problems, ...mechanicsProblems([written as Feature])];
  delete written.rulesText;
  if (mechanics.length) return {...mechanicsRefusal(mechanics), error: 'nothing was added: fix every one of these, all in one call'};
  const raw = service.raw();
  const existing = ((raw as any)[list] || []) as Feature[];
  if (existing.some(f => (f.name || '').toLowerCase() === name.toLowerCase())) {
    return {error: `the character already has the ${listNames[list]} ${name}`};
  }
  if (list === 'feats') {
    const written = text(args['prerequisites']) || /prerequisites?:\s*([^\n]+?)(\.\s|\n|$)/i.exec(text(args['description']))?.[1] || '';
    const unmet = written && !/^none$/i.test(written) ? unmetPrerequisites(service, written) : [];
    if (unmet.length) {
      return {error: `nothing was added: the character does not meet the prerequisites of ${name}: ${unmet.join('; ')}. Tell the player and suggest a feat it qualifies for`};
    }
  }
  // while creating, a feat more than the character can take is a bonus feat a feature has to give first
  if (list === 'feats' && raw.creation) {
    const applied = service.applied();
    const allowed = availableFeats(applied);
    if ((applied.feats || []).length >= allowed) {
      return {error: `nothing was added: the character can take ${allowed} feat${allowed === 1 ? '' : 's'} and has them. A bonus `
        + 'feat of the race or class (a human\'s, a fighter\'s) needs "bonusFeats": 1 on the feature that gives it '
        + '(edit_feature), then add the feat'};
    }
  }
  const charges = chargesOf(args);
  const feature = new Feature({
    name,
    description: describe(text(args['description']), basedOn, sourceUrl),
    adjustments: written.adjustments,
    // a condition or a feature that can be turned off (a buff, a stance) gets the toggle the sheet shows
    ...(list === 'conditions' || args['can_turn_off'] === true ? {active: true} : {}),
    ...(charges ?? written.charges ? {charges: charges ?? written.charges} : {}),
  });
  const problems = validateFeature(JSON.parse(JSON.stringify(feature)), {reference: service.applied()}, name);
  if (hasErrors(problems)) return problemsResult(problems);
  const summary = describeAdjustments(feature.adjustments);
  return service.labelled(`add ${name}`, () => {
    service.consumeFeature({feature, destination: list});
    return {
      done: `added the ${listNames[list]} ${name}${unchecked(basedOn)}${summary ? `: ${summary}` : ''}`,
      ...(form.wrote.length ? {byLevel: form.wrote, checkByLevel: 'the app wrote these from your table: check each against the rules'} : {}),
      ...warningsOf(problems),
    };
  });
};

// a weapon's attack from what its stat block says, so the AI does not have to write the attack object: its damage
// dice, critical ("19-20/x2", "x3"), whether it is a melee or ranged attack, its damage type and range increment. a
// thrown weapon (a javelin) is a ranged attack that takes Strength to damage; kind is the one attack to build
export const weaponAttack = (
  args: {[name: string]: unknown}, name: string, kind = text(args['attack_kind']).toLowerCase(),
): MeleeAttack | RangeAttack | {error: string} | undefined => {
  const damage = text(args['damage']).replace(/\s+/g, '');
  if (!damage) return undefined;
  if (!/^\d+d\d+([+-]\d+)?$/i.test(damage)) return {error: `damage is the weapon's dice for a medium wielder, "1d8", not ${args['damage']}`};
  const ranged = kind === 'ranged' || kind === 'thrown';
  const attack = Object.assign(ranged ? new RangeAttack() : new MeleeAttack(), {
    name, damage: damage.toLowerCase(), toHitAbility: ranged ? 'dex' : 'str', damageAbility: ranged ? '' : 'str',
  });
  const critical = text(args['critical']).toLowerCase();
  const range = /^(\d+)(?:\s*-\s*20)?/.exec(critical);
  if (range && Number(range[1]) <= 20 && Number(range[1]) >= 15) attack.crit = Number(range[1]);
  const multiplier = /[x×]\s*(\d)/.exec(critical);
  if (multiplier) attack.critMultiplier = Number(multiplier[1]);
  const types = (text(args['damage_type']).toUpperCase().match(/\b[BPS]\b/g) || []) as ('B' | 'P' | 'S')[];
  if (types.length) attack.damageType = [...new Set(types)];
  const increment = Math.floor(Number(args['range']));
  if (increment > 0) attack.range = increment;
  if (kind === 'thrown') Object.assign(attack, {thrown: true, range: attack.range || 10});
  if (ranged && /\bbow\b|longbow|shortbow/i.test(name)) {
    attack.bow = /composite/i.test(name) ? 'composite' : 'bow';
    const rating = /\+(\d)\s*str/i.exec(name);
    if (rating) attack.compositeRating = Number(rating[1]);
  }
  return attack;
};

// the attacks of a weapon the AI gave no attack_kind (a light crossbow made a melee attack): a bow, crossbow, sling or
// firearm shoots, a javelin or dart is thrown, another weapon with a range increment (a dagger, a spear) is melee and
// thrown, the rest melee
const SHOT = /\b(bows?|longbow|shortbow|crossbows?|sling|blowgun|pistol|musket|rifle|firearm)\b/i;
const THROWN_ONLY = /\b(javelin|darts?|shuriken|bolas|throwing|chakram|aklys|net)\b/i;
const kindsOf = (name: string, range: number): string[] =>
  SHOT.test(name) ? ['ranged'] : THROWN_ONLY.test(name) ? ['thrown'] : range > 0 ? ['melee', 'thrown'] : ['melee'];

// the attacks a weapon makes, by attack_kind: "melee and thrown" (a dagger, a spear) makes both
export const weaponAttacks = (args: {[name: string]: unknown}, name: string): {melee: MeleeAttack[], ranged: RangeAttack[], error?: string} | undefined => {
  const kinds = text(args['attack_kind']).toLowerCase().match(/melee|ranged|thrown/g) || kindsOf(name, Number(args['range']));
  const made: {melee: MeleeAttack[], ranged: RangeAttack[]} = {melee: [], ranged: []};
  for (const kind of [...new Set(kinds)]) {
    const attack = weaponAttack(args, name, kind);
    if (!attack) return undefined;
    if ('error' in attack) return {...made, error: attack.error};
    (attack instanceof RangeAttack ? made.ranged : made.melee).push(attack);
  }
  return made;
};

export const isAttackAdjustment = (path: string): boolean => path === 'melee' || path === 'ranged';

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
  // an item marked looked up that was not (the AI buys a kit before its lookups come back): added from memory, which
  // the player is told to check, rather than refused and bought again
  let provenanceNote: string | undefined;
  let source = provenance(args, name);
  if (source.error && text(args['based_on']) === 'looked up') {
    source = provenance({...args, based_on: 'own knowledge'}, name);
    provenanceNote = 'not looked up, so it is marked from memory: look it up and edit_item its description if it needs the page';
  }
  // everything wrong with the item, told at once: one more call fixes all of it
  const issues: string[] = [];
  if (source.error || !source.basedOn) issues.push(String(source.error || 'based_on is one of looked up, player description, own knowledge'));
  const basedOn = source.basedOn ?? 'own knowledge';
  const sourceUrl = source.sourceUrl;
  const type = text(args['type']) || 'other';
  if (!(itemTypes as readonly string[]).includes(type)) return {error: `type is one of ${itemTypes.join(', ')}`};
  const features = parseJsonList(args['features'], 'features');
  if (features.error) issues.push(features.error);
  const given = features.value === undefined ? undefined : Array.isArray(features.value) ? features.value : [features.value];

  const item: any = baseItem(type);
  item.name = name;
  item.type = type;
  item.description = describe(text(args['description']), basedOn, sourceUrl);
  if (vagueItem(name)) issues.push(`${name} is not an item: add each piece by its own name and price`);
  const slot = text(args['slot']) as Slot;
  if (slot) {
    if (!slots.includes(slot)) issues.push(`slot is one of ${slots.join(', ')}`);
    else item.slot = slot;
  }
  const number = (field: string): number | undefined => {
    const value = Number(args[field]);
    return args[field] === undefined || args[field] === null || args[field] === '' || !Number.isFinite(value) ? undefined : value;
  };
  item.weight = number('weight') ?? item.weight;
  item.quantity = Math.max(1, Math.floor(number('quantity') ?? 1));
  // ammunition by the bundle, the starting outfit free while creating: the price put right, and the AI told
  const price = args['cost_gp'] === undefined || args['cost_gp'] === null || args['cost_gp'] === '' ? 0 : priceInGp(args['cost_gp']);
  if (!(price >= 0)) issues.push(`cost_gp is the price of one in gp (1 gp = 10 sp = 100 cp: 5 sp is 0.5, 2 cp is 0.02), or "5 sp": not ${args['cost_gp']}`);
  const fair = fairPrice(name, price, item.quantity, {firstOutfitFree: !!service.raw().creation && !hasOutfit(service.raw().inventory)});
  // in coins, as the sheet keeps it: 0.1 gp is 1 sp
  item.cost = gpToPurse(fair.cost);
  if (number('hands') !== undefined) item.hands = Math.max(0, Math.floor(number('hands')!));
  if (text(args['proficiency'])) item.proficiency = text(args['proficiency']);
  const armorCategory = text(args['armor_category']);
  if (type === 'armor' && armorCategory) {
    if (!ARMOR_CATEGORIES.includes(armorCategory as ArmorCategory)) issues.push(`armor_category is one of ${ARMOR_CATEGORIES.join(', ')}`);
    else item.armorCategory = armorCategory;
  }
  // armor's category is on its page: without it the sheet can not tell how it slows its wearer (scale mail went in
  // as light)
  if (type === 'armor' && !armorCategory) issues.push('armor needs its armor_category from its page (light, medium or heavy)');
  const slowing = type === 'armor' && ['medium', 'heavy'].includes(String(item.armorCategory));
  if (slowing && !(Array.isArray((item as any).speed) && (item as any).speed.length)) (item as any).speed = [20, 15];
  const shieldCategory = text(args['shield_category']);
  if (type === 'shield' && shieldCategory) {
    if (!SHIELD_CATEGORIES.includes(shieldCategory as ShieldCategory)) issues.push(`shield_category is one of ${SHIELD_CATEGORIES.join(', ')}`);
    else item.shieldCategory = shieldCategory;
  }
  // the features the AI wrote replace the template ones of a weapon, armor or shield (an attack, an armor bonus)
  if (given) item.features = given.map((f: any) => {
    const {descriptionOnly, ...feature} = normalizedFeature(f) ?? {};
    return new Feature({...feature, name: f?.name || name, description: f?.description ?? '', adjustments: feature.adjustments ?? {}});
  });
  if (type === 'weapon') {
    const features = item.features as Feature[];
    // the weapon's attacks and the feature holding them go by the weapon's name (the AI wrote "Greatswordya")
    for (const feature of features) {
      const attacks = ['melee', 'ranged'].flatMap(list => {
        const value = (feature.adjustments as any)?.[list];
        return Array.isArray(value) ? value : [];
      });
      if (!attacks.length) continue;
      feature.name = name;
      attacks.forEach(attack => attack && typeof attack === 'object' && (attack.name = name));
    }
    // a weapon's own bonus is on its attack: melee.* would give it to every attack the character makes
    const everyAttack = features.flatMap(f => Object.keys(f.adjustments || {})).filter(p => /^(melee|ranged)\.\*\./.test(p));
    if (everyAttack.length) {
      issues.push(`${everyAttack.join(', ')} adjusts every attack of the character, not this weapon. Give the weapon's damage, critical and attack_kind, and a masterwork or magic weapon's bonus in its description`);
    }
    const attacks = weaponAttacks(args, name);
    if (attacks?.error) issues.push(attacks.error);
    // the template's attack has no damage: the one from the stat block replaces it
    const hasAttack = features.some(f => Object.keys(f.adjustments || {}).some(isAttackAdjustment)) && !(attacks && !given);
    if (!hasAttack) {
      if (!attacks || attacks.error) {
        if (!attacks) issues.push('a weapon needs its attack. Give damage (its dice, "1d8"), critical ("19-20/x2", "x3"), attack_kind (melee, ranged, thrown, or "melee and thrown" for a dagger or spear), damage_type and range from its stat block');
      } else item.features = [...features.filter(f => Object.keys(f.adjustments || {}).length && !Object.keys(f.adjustments).some(isAttackAdjustment)),
        new Feature({name, description: '', adjustments: {
          ...(attacks.melee.length ? {melee: attacks.melee} : {}), ...(attacks.ranged.length ? {ranged: attacks.ranged} : {}),
        }})];
    }
  }

  const problems = (item.features as Feature[]).flatMap((feature, i) =>
    validateFeature(JSON.parse(JSON.stringify(feature)), {reference: service.applied()}, `${name}.features[${i}]`));
  if (issues.length || hasErrors(problems)) {
    const invalid = hasErrors(problems) ? formatProblems(problems.filter(p => p.severity !== 'warning')).split('\n').filter(Boolean) : [];
    return {error: 'nothing was added: fix every one of these, all in one call (get_adjustment_reference explains the paths)', problems: [...issues, ...invalid]};
  }

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
  // a weapon held in two hands attacks two-handed: its damage takes 1 1/2 times the Strength bonus (a greataxe made
  // +5 of a +5 Strength, not +7)
  if (type === 'weapon' && Number(item.hands) >= 2) {
    for (const feature of item.features as Feature[]) {
      const melee = (feature.adjustments as any)?.melee;
      for (const attack of Array.isArray(melee) ? melee : melee ? [melee] : []) {
        if (attack && typeof attack === 'object' && (!attack.hand || attack.hand === 'primary')) attack.hand = 'two-handed';
      }
    }
  }
  const summary = (item.features as Feature[]).map(f => describeAdjustments(f.adjustments)).filter(Boolean).join('; ');
  return service.labelled(`add ${name}`, () => {
    service.update({inventory: [...(raw.inventory || []), item]});
    return {
      done: `added ${item.quantity > 1 ? `${item.quantity} ` : ''}${name}${item.equipped ? ' (equipped)' : ''}${unchecked(basedOn)}${summary ? `: ${summary}` : ''}`,
      ...(note ? {note} : {}),
      ...(fair.note ? {priceCorrected: fair.note} : {}),
      ...(provenanceNote ? {source: provenanceNote} : {}),
      ...(item.equipped || !(item.features as Feature[]).length ? {} : {reminder: 'its features apply only while it is equipped'}),
      ...warningsOf(problems),
    };
  });
};

// a kit bought in one call, one undo step: each item as create_item takes it. what fails is told with its problems
// and the rest is bought (the AI bought eight items with eight requests)
export const createItems = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const read = parseJsonList(args['items'], 'items');
  if (read.error) return {error: read.error};
  const list = Array.isArray(read.value) ? read.value : read.value ? [read.value] : [];
  if (!list.length) return {error: 'items is a JSON array of the items, each as create_item takes it: [{"name": "Backpack", "type": "other", "cost_gp": 2}]'};
  const added: string[] = [];
  const refused: {name: string, error?: unknown, problems?: unknown}[] = [];
  const results = service.labelled(`buy ${list.length} items`, () => list.map(item => {
    const given = item && typeof item === 'object' ? item as {[name: string]: unknown} : {};
    return {name: text(given['name']) || 'an item', result: createItem(service, {based_on: args['based_on'], source_url: args['source_url'], ...given})};
  }));
  for (const {name, result} of results) {
    if (typeof result.done === 'string') added.push(result.done.replace(/^added /, ''));
    else refused.push({name, error: result.error, ...(result['problems'] ? {problems: result['problems']} : {})});
  }
  if (!added.length) return {error: 'nothing was added: fix every one of these, all in one call', refused};
  return {
    done: `added ${added.length} item${added.length > 1 ? 's' : ''}: ${results.filter(r => typeof r.result.done === 'string').map(r => r.name).join(', ')}`,
    items: added,
    ...(refused.length ? {refused, fix: 'the refused ones were not added: fix them and add them with create_items, in one call'} : {}),
  };
};
