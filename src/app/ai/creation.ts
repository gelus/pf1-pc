import {ApplyCharacterService} from '../apply-character.service';
import {RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {Alignment, Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {ABILITIES} from '../rules/class-progression';
import {POINT_BUY_BUDGETS, POINT_BUY_COST, pointBuyTotal} from '../rules/point-buy';
import {AdvancementTrack} from '../interfaces/character.interface';
import {purseToCopper, purseToString} from '../utils/wealth.util';
import {describe, describeAdjustments, provenance, unchecked} from './builders';
import {levelUpStatus} from './level-up';
import {ClassLevel} from '../utils/classlevel.class';
import {parseJsonArg, parseJsonList} from './json-arg';
import {fairPrice, hasOutfit} from './gear-prices';
import {mechanicsProblems, mechanicsRefusal, normalizedFeature, withoutMarks} from './mechanics';
import {ActionResult} from './play-actions';

// creating a character with the AI, before and around its first class level (add_class_level): who it is
// (set_character_details), its ability scores (set_ability_scores, point buy checked), its race from the race's page
// (set_race) and where it stands (get_creation_status). its feats, traits, skills and gear go through the builders and
// the level up tools; gear bought counts against the starting wealth of its first class level

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const lower = (value: unknown): string => text(value).toLowerCase();

export {POINT_BUY_COST, pointBuyTotal};

const ALIGNMENTS: Alignment[] = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];
const alignmentOf = (value: string): Alignment | undefined => {
  const v = value.trim().toUpperCase().replace(/\s+/g, ' ');
  const words: {[name: string]: Alignment} = {
    'LAWFUL GOOD': 'LG', 'NEUTRAL GOOD': 'NG', 'CHAOTIC GOOD': 'CG', 'LAWFUL NEUTRAL': 'LN', 'NEUTRAL': 'N',
    'TRUE NEUTRAL': 'N', 'CHAOTIC NEUTRAL': 'CN', 'LAWFUL EVIL': 'LE', 'NEUTRAL EVIL': 'NE', 'CHAOTIC EVIL': 'CE',
  };
  return ALIGNMENTS.includes(v as Alignment) ? v as Alignment : words[v];
};

export const creationStatus = (service: ApplyCharacterService): object => {
  const raw = service.raw();
  const applied = service.applied();
  const scores = raw.abilityScores || {};
  const buy = pointBuyTotal(scores);
  const traitsTaken = (raw.traits || []).length;
  return {
    name: raw.name, alignment: raw.alignment, deity: raw.deity || 'none',
    race: raw.race?.features?.length ? raw.race.name : 'not set yet',
    baseAbilityScores: scores,
    pointBuy: Number.isNaN(buy) ? 'scores outside 7-18, not a point buy' : buy,
    abilityScoresWithRace: Object.fromEntries(ABILITIES.map(a => [a, applied.abilityScores?.[a]])),
    favoredClasses: raw.favoredClasses || [],
    traits: `${traitsTaken} of 2 (one more per drawback)`,
    startingWealthLeft: (raw.classLevels || []).length
      ? purseToString(new RemainingStartingWealthPipe().transform(raw))
      : 'comes with the first class level',
    levelUp: levelUpStatus(service),
  };
};

// what a kit costs and the starting gold left after it, so the AI never adds prices up in the chat (it did, and got
// them wrong in front of the player)
export const priceGear = (service: ApplyCharacterService, args: {[name: string]: unknown}): object => {
  const read = parseJsonList(args['items'], 'items');
  if (read.error) return {error: read.error};
  const items = Array.isArray(read.value) ? read.value : [];
  if (!items.length) return {error: 'items is a JSON array of what to buy, [{"name": "Longsword", "cost_gp": 15, "quantity": 1}]'};
  const lines: string[] = [];
  const corrected: string[] = [];
  let total = 0;
  // the first outfit of a character with none is its free starting outfit
  let outfitFree = !hasOutfit(service.raw().inventory);
  for (const item of items) {
    const given = Number(item?.cost_gp);
    const quantity = Math.max(1, Math.floor(Number(item?.quantity ?? 1)) || 1);
    if (!Number.isFinite(given) || given < 0) return {error: `${item?.name || 'an item'} needs its cost_gp, the price of one`};
    const fair = fairPrice(String(item?.name || ''), given, quantity, {firstOutfitFree: outfitFree});
    if (fair.note) corrected.push(fair.note);
    if (/\boutfit\b|\bclothes\b|\bclothing\b/i.test(String(item?.name || ''))) outfitFree = false;
    const cost = fair.cost;
    total += cost * quantity;
    lines.push(`${quantity > 1 ? `${quantity} x ` : ''}${item?.name || 'item'}: ${Math.round(cost * quantity * 100) / 100} gp`);
  }
  total = Math.round(total * 100) / 100;
  const raw = service.raw();
  const fixed = corrected.length ? {pricesCorrected: corrected} : {};
  if (!(raw.classLevels || []).length) return {costs: lines, total: `${total} gp`, ...fixed, note: 'the starting gold comes with the first class level'};
  if (!raw.classLevels[0].startingWealth) {
    return {costs: lines, total: `${total} gp`, ...fixed, note: 'the character has no starting gold yet: ask the player whether they roll it or take the class\'s average, and set it with set_character_details starting_gold'};
  }
  const left = Math.round(purseToCopper(new RemainingStartingWealthPipe().transform(raw))) / 100;
  return {costs: lines, total: `${total} gp`, ...fixed, goldLeftNow: `${left} gp`, goldLeftAfter: `${Math.round((left - total) * 100) / 100} gp`, fits: total <= left,
    ...(total <= left ? {} : {hint: 'swap what costs most for something cheaper and price it once more, or ask the player what to leave out'})};
};

export const setCharacterDetails = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const change: {[field: string]: unknown} = {};
  const what: string[] = [];
  if (text(args['name'])) { change['name'] = text(args['name']); what.push(`named ${change['name']}`); }
  if (text(args['alignment'])) {
    const alignment = alignmentOf(text(args['alignment']));
    if (!alignment) return {error: `alignment is one of ${ALIGNMENTS.join(', ')}`};
    change['alignment'] = alignment;
    what.push(alignment);
  }
  if (typeof args['deity'] === 'string') { change['deity'] = text(args['deity']); what.push(`deity ${change['deity'] || 'none'}`); }
  if (typeof args['description'] === 'string') { change['description'] = args['description']; what.push('description'); }
  for (const field of ['age', 'height', 'weight'] as const) {
    const value = Number(args[field]);
    if (args[field] === undefined || args[field] === null || args[field] === '' || !Number.isFinite(value)) continue;
    change[field] = value;
    what.push(`${field} ${value}`);
  }
  if (args['favored_classes'] !== undefined) {
    const classes = (Array.isArray(args['favored_classes']) ? args['favored_classes'] : String(args['favored_classes']).split(','))
      .map(c => text(c)).filter(Boolean);
    change['favoredClasses'] = classes;
    what.push(`favored class ${classes.join(', ') || 'none'}`);
  }
  if (args['starting_gold'] !== undefined && args['starting_gold'] !== null && args['starting_gold'] !== '') {
    const gold = Number(args['starting_gold']);
    const levels = service.raw().classLevels || [];
    if (!(gold >= 0)) return {error: 'starting_gold is the starting wealth in gp'};
    if (!levels.length) return {error: 'the starting gold comes with the first class level: add it first'};
    // it is what the class level brings before anything is bought, the gold left is worked out from it: the AI wrote
    // the gold left in it, which spent the gear's cost twice
    if (levels[0].startingWealth > 0) {
      return {error: `the starting gold is set already (${levels[0].startingWealth} gp, before buying): leave starting_gold out, the gold left is worked out from it`};
    }
    change['classLevels'] = levels.map((level, i) => i === 0 ? new ClassLevel({...level, startingWealth: gold}) : level);
    what.push(`starting gold ${gold} gp`);
  }
  if (text(args['advancement_track'])) {
    const track = lower(args['advancement_track']) as AdvancementTrack;
    if (!['slow', 'medium', 'fast'].includes(track)) return {error: 'advancement_track is slow, medium or fast'};
    change['advancementTrack'] = track;
    what.push(`${track} advancement`);
  }
  if (!what.length) return {error: 'say what to set: name, alignment, deity, description, age, height, weight, favored_classes, advancement_track or starting_gold'};
  return service.labelled(`details: ${what.join(', ')}`, () => {
    service.update(change);
    return {done: `set ${what.join(', ')}`};
  });
};

// the table rolls its scores (as the concept step recorded it): a point buy means nothing for them
export const tableRollsScores = (service: ApplyCharacterService): boolean => {
  const concept = service.raw().creation?.decisions?.['concept'] || '';
  return /\broll/i.test(concept) && !/point.?buy/i.test(concept);
};

// player: the player confirmed the scores themselves (the point buy of the chat), at the points they chose, with some
// left unspent if they like
export const setAbilityScores = (service: ApplyCharacterService, args: {[name: string]: unknown}, player = false): ActionResult => {
  const read = parseJsonArg(args['scores'], 'scores');
  if (read.error) return {error: read.error};
  const scores: {[ability: string]: unknown} = read.value && typeof read.value === 'object' ? read.value : {};
  const base: {[ability: string]: number} = {};
  for (const ability of ABILITIES) {
    const score = Math.floor(Number(scores[ability]));
    if (!(score >= 3 && score <= 20)) return {error: `scores needs all six base scores before racial modifiers, {"str": 14, "dex": 12, ...}: ${ability} is missing or not 3-20`};
    base[ability] = score;
  }
  const method = lower(args['method']);
  const budget = Number(/(\d+)/.exec(method)?.[1]);
  if (method.startsWith('point buy') && tableRollsScores(service)) {
    return {error: 'the table rolls its ability scores (the concept says so): set the rolled scores where the player put them, method "rolled"'};
  }
  if (method.startsWith('point buy')) {
    if (player ? !(budget >= 0) : !POINT_BUY_BUDGETS.includes(budget)) return {error: 'a point buy is 10, 15, 20 or 25 points: method "point buy 20"'};
    const total = pointBuyTotal(base);
    if (Number.isNaN(total)) return {error: 'a point buy keeps every score between 7 and 18 before racial modifiers'};
    if (player ? total > budget : total !== budget) return {error: `those scores cost ${total} points, the point buy is ${budget}: ${total > budget ? 'lower' : 'raise'} some`, costs: POINT_BUY_COST};
  } else if (!['rolled', 'given', 'standard'].some(m => method.startsWith(m))) {
    return {error: 'method is "point buy <points>", "rolled" or "given" (scores the player had already)'};
  }
  return service.labelled('set ability scores', () => {
    service.update({abilityScores: {...service.raw().abilityScores, ...base}});
    const applied = service.applied();
    return {
      done: `ability scores ${ABILITIES.map(a => `${a} ${base[a]}`).join(', ')}${method.startsWith('point buy') ? ` (${budget}-point buy)` : ''}`,
      withRaceAndFeatures: Object.fromEntries(ABILITIES.map(a => [a, applied.abilityScores[a]])),
    };
  });
};

// the ability modifiers of a race are its racial stats: written in another trait (an elf's in Elven Immunities) they
// are moved to the racial stats, or to a feature of their own when there is none
const STATS = /\b(stats|abilit(y|ies)|scores?|modifiers?)\b/i;
const statsTogether = (features: Feature[], race: string): Feature[] => {
  const moved: {[path: string]: unknown} = {};
  const kept = features.map(feature => {
    if (STATS.test(feature.name || '')) return feature;
    const paths = Object.keys(feature.adjustments || {}).filter(path => path.startsWith('abilityScores.'));
    if (!paths.length) return feature;
    const adjustments: {[path: string]: unknown} = {...feature.adjustments};
    for (const path of paths) {
      moved[path] = adjustments[path];
      delete adjustments[path];
    }
    return Object.assign(new Feature({...feature, adjustments: adjustments as Feature['adjustments']}), {descriptionOnly: (feature as any).descriptionOnly
      ?? (Object.keys(adjustments).length ? undefined : 'its numbers are in the racial stats')});
  });
  if (!Object.keys(moved).length) return features;
  const stats = kept.find(feature => STATS.test(feature.name || ''));
  if (stats) {
    stats.adjustments = {...stats.adjustments, ...moved} as Feature['adjustments'];
    return kept;
  }
  return [new Feature({name: `${race} Ability Modifiers`, description: '', adjustments: moved as Feature['adjustments']}), ...kept];
};

// the senses of the core races, which the AI leaves out (a half-orc went without its darkvision)
const CORE_SENSES: [RegExp, string][] = [
  [/^(dwarf|half-?orc|orc|drow|duergar|tiefling|aasimar)\b/i, 'darkvision 60 ft.'],
  [/^(elf|half-?elf|gnome)\b/i, 'low-light vision'],
];
const withSenses = (features: Feature[], race: string): Feature[] => {
  const senses = CORE_SENSES.find(([named]) => named.test(race.trim()))?.[1];
  if (!senses || features.some(f => Object.keys(f.adjustments || {}).some(path => path.startsWith('senses')))) return features;
  const name = /darkvision/.test(senses) ? 'Darkvision' : 'Low-Light Vision';
  const written = features.find(f => (f.name || '').toLowerCase() === name.toLowerCase());
  if (written) {
    written.adjustments = {...written.adjustments, senses} as Feature['adjustments'];
    delete (written as any).descriptionOnly;
    return features;
  }
  return [...features, new Feature({name, description: senses, adjustments: {senses} as Feature['adjustments']})];
};

export const setRace = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const name = text(args['name']);
  if (!name) return {error: 'the race needs a name'};
  const {basedOn, sourceUrl, error} = provenance(args);
  if (error || !basedOn) return {error};
  const read = parseJsonList(args['features'], 'features');
  if (read.error) return {error: read.error};
  const parsed: unknown = read.value;
  if (!Array.isArray(parsed) || !parsed.length) {
    return {error: 'features is a JSON array of the racial traits, the first the racial stats: {"name": "Half-Orc racial stats", "adjustments": {"abilityScores.str": 2, "speed.land": {"value": 30, "mode": "set"}, "size": {"value": 4, "mode": "set"}, "languages": "Common, Orc"}}'};
  }
  const given = parsed.map((f: any) => {
    const written = normalizedFeature(f) ?? {};
    return new Feature({...written, description: describe(written.description ?? '', basedOn, sourceUrl), adjustments: written.adjustments ?? {}});
  });
  const together = withSenses(statsTogether(given, name), name);
  const features = withoutMarks(together);
  // everything wrong at once: one more call fixes all of it
  const problems: string[] = [];
  // every core race adjusts its ability scores: a race without one left a choice unmade (a human's +2 to one ability)
  const adjustsAbilities = features.some(f => Object.keys(f.adjustments || {}).some(path => path.startsWith('abilityScores.')));
  if (!adjustsAbilities) {
    problems.push('the race adjusts no ability score: put its ability modifiers in the racial stats, and for a +2 to one ability of the player\'s choice ask which and adjust that one ({"abilityScores.str": 2})');
  }
  const invalid = features.flatMap((f, i) => validateFeature(JSON.parse(JSON.stringify(f)), {reference: service.applied()}, `${f.name || 'trait'} [${i}]`));
  if (hasErrors(invalid)) problems.push(...formatProblems(invalid.filter(p => p.severity !== 'warning')).split('\n').filter(Boolean));
  problems.push(...mechanicsProblems(together));
  if (problems.length) return mechanicsRefusal(problems);
  const raw = service.raw();
  const was = raw.race?.features?.length ? raw.race.name : undefined;
  return service.labelled(`race ${name}`, () => {
    service.update({race: {...raw.race, name, subtype: text(args['subtype']) || raw.race?.subtype || 'Humanoid', features}});
    return {
      done: `${was ? `race ${was} -> ${name}` : `race ${name}`}${unchecked(basedOn)}: ${features.map(f => f.name).join(', ')}`,
      traits: features.map(f => `${f.name}: ${describeAdjustments(f.adjustments) || 'description only'}`),
    };
  });
};
