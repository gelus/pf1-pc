import {ApplyCharacterService} from '../apply-character.service';
import {RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {Alignment, Feature} from '../interfaces/character.interface';
import {formatProblems, hasErrors, validateFeature} from '../rules/adjustment-schema';
import {ABILITIES} from '../rules/class-progression';
import {AdvancementTrack} from '../interfaces/character.interface';
import {purseToString} from '../utils/wealth.util';
import {describe, describeAdjustments, provenance, unchecked} from './builders';
import {levelUpStatus} from './level-up';
import {ActionResult} from './play-actions';

// creating a character with the AI, before and around its first class level (add_class_level): who it is
// (set_character_details), its ability scores (set_ability_scores, point buy checked), its race from the race's page
// (set_race) and where it stands (get_creation_status). its feats, traits, skills and gear go through the builders and
// the level up tools; gear bought counts against the starting wealth of its first class level

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const lower = (value: unknown): string => text(value).toLowerCase();

// what a score costs in a point buy (core rulebook, ability scores)
export const POINT_BUY_COST: {[score: number]: number} = {
  7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17,
};
export const pointBuyTotal = (scores: {[ability: string]: number}): number =>
  ABILITIES.reduce((sum, ability) => sum + (POINT_BUY_COST[scores[ability]] ?? NaN), 0);

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
  if (text(args['advancement_track'])) {
    const track = lower(args['advancement_track']) as AdvancementTrack;
    if (!['slow', 'medium', 'fast'].includes(track)) return {error: 'advancement_track is slow, medium or fast'};
    change['advancementTrack'] = track;
    what.push(`${track} advancement`);
  }
  if (!what.length) return {error: 'say what to set: name, alignment, deity, description, age, height, weight, favored_classes or advancement_track'};
  return service.labelled(`details: ${what.join(', ')}`, () => {
    service.update(change);
    return {done: `set ${what.join(', ')}`};
  });
};

export const setAbilityScores = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  let scores: {[ability: string]: unknown} = {};
  const given = args['scores'];
  if (typeof given === 'string') {
    try {
      scores = JSON.parse(given);
    } catch (e) {
      return {error: `scores is not valid JSON: ${(e as Error).message}`};
    }
  } else if (given && typeof given === 'object') scores = given as {[ability: string]: unknown};
  const base: {[ability: string]: number} = {};
  for (const ability of ABILITIES) {
    const score = Math.floor(Number(scores[ability]));
    if (!(score >= 3 && score <= 20)) return {error: `scores needs all six base scores before racial modifiers, {"str": 14, "dex": 12, ...}: ${ability} is missing or not 3-20`};
    base[ability] = score;
  }
  const method = lower(args['method']);
  const budget = Number(/(\d+)/.exec(method)?.[1]);
  if (method.startsWith('point buy')) {
    if (![10, 15, 20, 25].includes(budget)) return {error: 'a point buy is 10, 15, 20 or 25 points: method "point buy 20"'};
    const total = pointBuyTotal(base);
    if (Number.isNaN(total)) return {error: 'a point buy keeps every score between 7 and 18 before racial modifiers'};
    if (total !== budget) return {error: `those scores cost ${total} points, the point buy is ${budget}: ${total > budget ? 'lower' : 'raise'} some`, costs: POINT_BUY_COST};
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

export const setRace = (service: ApplyCharacterService, args: {[name: string]: unknown}): ActionResult => {
  const name = text(args['name']);
  if (!name) return {error: 'the race needs a name'};
  const {basedOn, sourceUrl, error} = provenance(args);
  if (error || !basedOn) return {error};
  let parsed: unknown = args['features'];
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (e) {
      return {error: `features is not valid JSON: ${(e as Error).message}`};
    }
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    return {error: 'features is a JSON array of the racial traits, the first the racial stats: {"name": "Half-Orc racial stats", "adjustments": {"abilityScores.str": 2, "speed.land": {"value": 30, "mode": "set"}, "size": {"value": 4, "mode": "set"}, "languages": "Common, Orc"}}'};
  }
  const features = parsed.map((f: any) => new Feature({...f, description: describe(f?.description ?? '', basedOn, sourceUrl)}));
  const problems = features.flatMap((f, i) => validateFeature(JSON.parse(JSON.stringify(f)), {reference: service.applied()}, `${f.name || 'trait'} [${i}]`));
  if (hasErrors(problems)) return {error: 'nothing was changed: fix these problems and call again', problems: formatProblems(problems)};
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
