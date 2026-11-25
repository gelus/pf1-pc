import {missingRacialTraits, racialTraitProblems} from './page-facts';
import {favoredClassOptionFrom} from './favored-class';
import {pageFactsFor} from './rules-lookup';
import {casterOverview} from './spell-form';
import {ApplyCharacterService} from '../apply-character.service';
import {RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {Alignment, FavoredClassOption, Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {ABILITIES} from '../rules/class-progression';
import {POINT_BUY_BUDGETS, POINT_BUY_COST, pointBuyTotal} from '../rules/point-buy';
import {AdvancementTrack} from '../interfaces/character.interface';
import {priceInGp, purseToCopper, purseToString} from '../utils/wealth.util';
import {describe, describeAdjustments, provenance, unchecked} from './builders';
import {levelUpStatus} from './level-up';
import {ClassLevel, characterLevel} from '../utils/classlevel.class';
import {WEALTH_BY_LEVEL, startingLevelOf, startingWealthOf} from '../rules/starting-wealth';
import {advancesWithMaster} from '../rules/companions';
import {parseJsonArg, parseJsonList} from './json-arg';
import {fairPrice, hasOutfit, kitGaps, vagueItem} from './gear-prices';
import {mechanicsProblems, mechanicsRefusal, normalizedFeature, withoutMarks} from './mechanics';
import {ActionResult} from './play-actions';
import {checkCreatedCharacter} from './character-check';

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
    // a character made above 1st level: the level it is made at, and the wealth it buys its gear with
    ...(startingLevelOf(raw) > 1 ? {startingLevel: `${startingLevelOf(raw)} (${characterLevel(raw)} added so far), wealth ${startingWealthOf(raw)} gp`} : {}),
    traits: `${traitsTaken} of 2 (one more per drawback)`,
    startingWealthLeft: (raw.classLevels || []).length
      ? purseToString(new RemainingStartingWealthPipe().transform(raw))
      : 'comes with the first class level',
    levelUp: levelUpStatus(service),
    // each caster's levels: what it casts a day, knows at most, has on its list and prepared (the spells step)
    ...(Object.keys(applied.spells || {}).length ? {spells: Object.entries(applied.spells).map(([origin, caster]) => casterOverview(origin, caster))} : {}),
    // from the details step on: what the app's check of the character would refuse, and what it would tell
    ...(['details', 'review'].includes(String(raw.creation?.step)) ? {check: checkCreatedCharacter(service)} : {}),
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
    const given = priceInGp(item?.cost_gp);
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
  const names = items.map((item: any) => String(item?.name || ''));
  const vague = names.filter(vagueItem);
  if (vague.length) return {error: `${vague.join(', ')} is not an item: list each piece by its own name and price (backpack 2 gp, bedroll 1 sp, trail rations 5 sp each, ...)`};
  const gaps = kitGaps(names, hasOutfit(raw.inventory));
  const fixed = {...(corrected.length ? {pricesCorrected: corrected} : {}), ...(gaps.length ? {missing: `the kit has no ${gaps.join(', nor ')}: add it, or say why not`} : {})};
  if (!(raw.classLevels || []).length) return {costs: lines, total: `${total} gp`, ...fixed, note: 'the starting gold comes with the first class level'};
  if (!startingWealthOf(raw)) {
    return {costs: lines, total: `${total} gp`, ...fixed, note: 'the character has no starting gold yet: ask the player whether they roll it or take the class\'s average, and set it with set_character_details starting_gold'};
  }
  const left = Math.round(purseToCopper(new RemainingStartingWealthPipe().transform(raw))) / 100;
  return {costs: lines, total: `${total} gp`, ...fixed, goldLeftNow: `${left} gp`, goldLeftAfter: `${Math.round((left - total) * 100) / 100} gp`, fits: total <= left,
    ...(total <= left ? {} : {hint: 'swap what costs most for something cheaper and price it once more, or ask the player what to leave out'})};
};

export const setCharacterDetails = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const change: {[field: string]: unknown} = {};
  const what: string[] = [];
  let goldKept: string | undefined;
  if (text(args['name'])) { change['name'] = text(args['name']); what.push(`named ${change['name']}`); }
  if (text(args['alignment'])) {
    const alignment = alignmentOf(text(args['alignment']));
    if (!alignment) return {error: `alignment is one of ${ALIGNMENTS.join(', ')}`};
    change['alignment'] = alignment;
    what.push(alignment);
  }
  if (typeof args['deity'] === 'string') { change['deity'] = text(args['deity']); what.push(`deity ${change['deity'] || 'none'}`); }
  if (typeof args['description'] === 'string') { change['description'] = args['description']; what.push('description'); }
  if (typeof args['backstory'] === 'string') { change['backstory'] = args['backstory']; what.push('backstory'); }
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
    const kept = `the starting gold is set already (${levels[0].startingWealth} gp, before buying): starting_gold was left out, the gold left is worked out from it`;
    // set already: the rest of the call is set, the gold left as it is
    if (levels[0].startingWealth > 0) goldKept = kept;
    else {
      change['classLevels'] = levels.map((level, i) => i === 0 ? new ClassLevel({...level, startingWealth: gold}) : level);
      what.push(`starting gold ${gold} gp`);
    }
  }
  // the level the character is made at, while it is created: above 1st, its levels after the first are added at the
  // higher levels step, and its gear bought with the wealth of its level
  if (args['starting_level'] !== undefined && args['starting_level'] !== null && args['starting_level'] !== '') {
    const level = Math.floor(Number(args['starting_level']));
    if (!(level >= 1 && level <= 20)) return {error: 'starting_level is the character level it is made at, 1 to 20'};
    if (!service.raw().creation && characterLevel(service.raw())) return {error: 'starting_level is set while the character is created: a created character levels up (get_level_up_step)'};
    change['startingLevel'] = level;
    what.push(`made at level ${level}${level > 1 ? ` (${WEALTH_BY_LEVEL[level]} gp of wealth)` : ''}`);
  }
  if (text(args['advancement_track'])) {
    const track = lower(args['advancement_track']) as AdvancementTrack;
    if (!['slow', 'medium', 'fast'].includes(track)) return {error: 'advancement_track is slow, medium or fast'};
    change['advancementTrack'] = track;
    what.push(`${track} advancement`);
  }
  if (!what.length) return {error: goldKept ?? 'say what to set: name, alignment, deity, description, age, height, weight, favored_classes, advancement_track, starting_level or starting_gold'};
  return service.labelled(`details: ${what.join(', ')}`, () => {
    service.update(change);
    return {done: `set ${what.join(', ')}`, ...(goldKept ? {note: goldKept} : {})};
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
    // a companion's scores are its creature's, from its stat block (a toad's Str 1, a horse's Str 16 and up)
    const [low, high] = advancesWithMaster(service.raw()) ? [1, 40] : [3, 20];
    if (!(score >= low && score <= high)) return {error: `scores needs all six base scores before racial modifiers, {"str": 14, "dex": 12, ...}: ${ability} is missing or not ${low}-${high}`};
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
const STATS = /\b(stats|abilit(y|ies)|scores?|modifiers?|adjustments?)\b/i;
const statsTogether = (written: Feature[], race: string): Feature[] => {
  const features = statsMerged(written);
  const moved: {[path: string]: unknown} = {};
  const kept = features.map(feature => {
    // (a feature from a later level is no racial stat: an animal companion's 7th-level advancement, Str +2)
    if (STATS.test(feature.name || '') || (feature.atLevel ?? 0) > 1) return feature;
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

// two features of the racial stats (the AI's "Human racial stats" and the page's "Ability Score Racial Traits", its
// +2 in the first): one, under the page's name, so the trait the page lists is there and adjusts what it says. the
// one with nothing of its own was refused as adjusting nothing
const statsMerged = (features: Feature[]): Feature[] => {
  const stats = features.filter(feature => STATS.test(feature.name || ''));
  if (stats.length < 2) return features;
  const into = stats.find(feature => !/\bracial stats$/i.test((feature.name || '').trim())) ?? stats[0];
  const merged = Object.assign(new Feature({
    ...into,
    description: [...new Set(stats.map(f => (f.description || '').trim()).filter(Boolean))].join(' '),
    adjustments: Object.assign({}, ...stats.map(f => f.adjustments || {})),
  }), {descriptionOnly: undefined});
  return features.flatMap(feature => feature === into ? [merged] : stats.includes(feature) ? [] : [feature]);
};

const sets = (features: Feature[], path: string): boolean =>
  features.some(f => Object.keys(f.adjustments || {}).some(p => p === path));

// a sense a trait's text gives (a half-orc's darkvision went without one): the sheet shows it only from "senses"
const SENSES = /\b(darkvision|low-light vision|see in darkness|scent|tremorsense|blindsense|blindsight)\b/i;
const sensesLeftOut = (features: Feature[]): string[] =>
  features.some(f => Object.keys(f.adjustments || {}).some(p => p.startsWith('senses'))) ? []
    : features.filter(f => SENSES.test(`${f.name || ''} ${f.description || ''}`)).map(f => f.name || 'a trait');

export const setRace = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const name = text(args['name']);
  if (!name) return {error: 'the race needs a name'};
  // where the traits come from, wrong or missing, is told with everything else
  // by its name too: a page looked up for the race stands for a link the AI garbled (RacesDetails.aspx?RacesDisplay...)
  const source = provenance(args, name);
  const basedOn = source.basedOn ?? 'own knowledge';
  const sourceUrl = source.sourceUrl;
  const read = parseJsonList(args['features'], 'features');
  if (read.error) return {error: read.error};
  const parsed: unknown = read.value;
  if (!Array.isArray(parsed) || !parsed.length) {
    return {error: 'features is a JSON array of the racial traits, the first the racial stats: {"name": "Half-Orc racial stats", "adjustments": {"abilityScores.str": 2, "speed.land": {"value": 30, "mode": "set"}, "size": {"value": 4, "mode": "set"}, "languages": "Common, Orc"}}'};
  }
  const given = parsed.map((f: any) => {
    const written = normalizedFeature(f) ?? {};
    // an alternate racial trait's "replaces", a list however it was written
    const replaces = (Array.isArray(written.replaces) ? written.replaces.map(String) : String(written.replaces ?? '').split(/,|;/))
      .map((r: string) => r.trim()).filter((r: string) => r && !/^none$/i.test(r));
    const {replaces: _, ...rest} = written;
    return new Feature({...rest, description: describe(written.description ?? '', basedOn, sourceUrl), adjustments: written.adjustments ?? {},
      ...(replaces.length ? {replaces} : {})});
  });
  // each trait is listed on the sheet by its shownIn (special qualities when it gives none)
  const together = statsTogether(given, name);
  const features = withoutMarks(together);
  // everything wrong at once: one more call fixes all of it
  const problems: string[] = source.error || !source.basedOn ? [String(source.error || 'based_on is one of looked up, player description, own knowledge')] : [];
  // the race's speed, size and languages are on its page (a half-orc came with none: 0 ft. on the sheet)
  // a companion's creature (a cat, a wolf) has its own scores and often no language
  const creature = advancesWithMaster(service.raw());
  const unset = ['speed.land', 'size', ...(creature ? [] : ['languages'])].filter(path => !sets(features, path));
  if (unset.length) problems.push(`the racial stats need ${unset.join(', ')} from its page, in its adjustments ({"speed.land": {"value": 30, "mode": "set"}, "size": {"value": 4, "mode": "set"}, "languages": "<its languages, comma separated>"})`);
  // every standard racial trait its page lists, or the alternate one replacing it (page-facts.ts)
  // a trait the page's list names that the AI says is not there (the reading garbled a name: "Manipulate Flame" for
  // Manipulative) is taken at its word and told, never made up to pass
  const notOnPage = (Array.isArray(args['not_on_page']) ? args['not_on_page'].map(String) : String(args['not_on_page'] ?? '').split(','))
    .map(t => t.trim().toLowerCase()).filter(Boolean);
  const left = missingRacialTraits(pageFactsFor(sourceUrl, name), features).filter(t => !notOnPage.includes(t.toLowerCase()));
  // the trait is wanted under its own name, not inside another: told so, a lookup of what it already read is no help
  if (left.length) problems.push(`its page (as read) lists ${left.join(', ')} as racial traits, and no trait here has that name: give each as a trait of its own under the page's name (${left.map(t => `{"name": "${t}", ...}`).join(', ')}) with what it does, not inside the racial stats or another trait. If you have not read its text, look_up_rules with focus "${left.join(', ')}". An alternate trait the player picked instead goes in with "replaces": ["<trait>"], and one the page does not have goes in not_on_page`);
  // the alternate racial traits: each in place of what it replaces, once (page-facts.ts)
  problems.push(...racialTraitProblems(pageFactsFor(sourceUrl, name), features));
  // the same bonus written twice counts twice (a dhampir's +2 against disease came as two traits)
  const seen = new Map<string, string>();
  for (const feature of features) {
    const paths = Object.entries(feature.adjustments || {}).filter(([path]) => path !== 'languages' && !path.startsWith('senses'));
    if (!paths.length) continue;
    const key = JSON.stringify(paths.sort());
    if (seen.has(key)) problems.push(`${feature.name} adjusts exactly what ${seen.get(key)} does: one trait, written twice, would count twice. Keep one`);
    else seen.set(key, feature.name || 'a trait');
  }
  const senses = sensesLeftOut(features);
  if (senses.length) problems.push(`${senses.join(', ')}: its text gives a sense, which the sheet shows from its adjustments: each sense with its range in feet ({"senses.darkvision": 60, "senses.low-light vision": 0})`);
  // a trait that changes no number is read on the sheet: without its rules it says nothing (Orc Ferocity, blank)
  const blank = parsed.filter((f: any) => !Object.keys(normalizedFeature(f)?.adjustments ?? {}).length
    && !String(f?.description ?? '').trim() && !String(f?.descriptionOnly ?? '').trim()).map((f: any) => f?.name || 'a trait');
  if (blank.length) problems.push(`${blank.join(', ')}: no adjustments and no description: give each its rules in a short description (what it does, when)`);
  // every core race adjusts its ability scores: a race without one left a choice unmade (a human's +2 to one ability)
  const adjustsAbilities = features.some(f => Object.keys(f.adjustments || {}).some(path => path.startsWith('abilityScores.')));
  if (!adjustsAbilities && !creature) {
    problems.push('the race adjusts no ability score: put its ability modifiers in the racial stats, and for a +2 to one ability of the player\'s choice ask which and adjust that one ({"abilityScores.str": 2})');
  }
  const invalid = features.flatMap((f, i) => validateFeature(JSON.parse(JSON.stringify(f)), {reference: service.applied()}, `${f.name || 'trait'} [${i}]`));
  if (hasErrors(invalid)) problems.push(...formatProblems(invalid.filter(p => p.severity !== 'warning')).split('\n').filter(Boolean));
  problems.push(...mechanicsProblems(together));
  // the alternate favored class bonuses its page lists, for the classes the player may take (favored-class.ts)
  const favoredOptions: FavoredClassOption[] = [];
  if (args['favored_class_options'] !== undefined && args['favored_class_options'] !== '') {
    const list = parseJsonList(args['favored_class_options'], 'favored_class_options');
    if (list.error) problems.push(list.error);
    for (const given of Array.isArray(list.value) ? list.value : list.value ? [list.value] : []) {
      const read = favoredClassOptionFrom(given);
      problems.push(...read.problems);
      if (read.option) favoredOptions.push(read.option);
    }
  }
  if (problems.length) return {...mechanicsRefusal(problems), error: 'nothing was changed: fix every one of these, all in one call'};
  const raw = service.raw();
  const was = raw.race?.features?.length ? raw.race.name : undefined;
  return service.labelled(`race ${name}`, () => {
    service.update({race: {...raw.race, name, subtype: text(args['subtype']) || raw.race?.subtype || 'Humanoid', features,
      // another race's options go with it
      favoredClassOptions: favoredOptions.length ? favoredOptions
        : raw.race?.name?.trim().toLowerCase() === name.toLowerCase() ? raw.race?.favoredClassOptions : undefined}});
    return {
      done: `${was ? `race ${was} -> ${name}` : `race ${name}`}${unchecked(basedOn)}: ${features.map(f => f.name).join(', ')}`,
      traits: features.map(f => `${f.name}: ${describeAdjustments(f.adjustments) || 'description only'}`),
    };
  });
};
