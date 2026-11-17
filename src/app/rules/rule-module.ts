import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import type {AdjustmentMapEntry} from '../apply-character.service';

// a rule module works a rule of the game out from the character's data (its class levels, its size, the damage it
// took, ...) and gives it back as features, which the engine applies like any other feature. so whatever a rule
// adjusts shows up in the tooltips of the sheet, with the name of the feature as its origin
//
// every hook is optional, and they run in this order while the applied character is worked out:
//  conditions: the conditions the character is under because of its data (dying below 0 hp, ...), they are resolved
//              together with every other condition (severity, inclusions, duplicates), a condition only given by its
//              name takes its template from the ConditionsService
//  base:       before any other feature. what follows from the raw data alone (bab and saves from class levels,
//              ability damage, ...). sets, mins and maxes given here are resolved with all the others
//  final:      after every other feature, formula and set, min and max: the character holds its final values (its
//              final size, strength, bab, ...). adjustments given here are resolved right away, sets and bounds included
//  finalize:   after everything, works on the applied character directly, for what is not an adjustment
//              (iterative attacks from the final bab, ...). it should only add to the character, not undo adjustments
//  finalConditions: once the applied character is worked out, the conditions it is under because of its final values
//              (dying below 0 hp, unconscious from its ability damage, ...). when any rule gives one, the character is
//              worked out once more from the start, under those conditions along with the others (resolved like the
//              conditions hook). so a condition given here must not change what the rule reads to give it (a helpless
//              character's dex is 0, a rule reading dex should not make it helpless), the engine does not go around again
//  a condition given by either conditions hook keeps the description of its template, the description the rule gave
//  becomes its reason ("-3 hp"), its source says where it comes from ("from hit points", "from <module name>" unless
//  the rule set it). the sheet lists them with the character's conditions, see ApplyCharacterService.ruleConditions
//
// raw is the character as saved, never change it. applied is the character being worked out
// context gives the hooks that run late what adjusted the character so far, read only
export interface RuleContext {
  // every adjustment applied so far, by the path it adjusts (see ApplyCharacterService.adjustmentsMap)
  adjustmentsMap: {[path: string]: AdjustmentMapEntry[]};
  // the names of the conditions applied to the character so far, lower case (see conditionKey). an adjustment whose
  // origin is one of them was made by that condition. optional so a context made by hand (in a spec) can leave it out
  conditionNames?: ReadonlySet<string>;
}

// the name a condition goes by in RuleContext.conditionNames, for the origin of an adjustment as well
export const conditionKey = (condition: {name?: string} | string): string =>
  (typeof condition === 'string' ? condition : condition.name || '').trim().toLowerCase();

export interface RuleModule {
  // names the module in errors
  name: string;
  conditions?(raw: Character): Feature[];
  base?(raw: Character, applied: Character): Feature[];
  final?(raw: Character, applied: Character, context: RuleContext): Feature[];
  finalize?(raw: Character, applied: Character, context: RuleContext): void;
  finalConditions?(raw: Character, applied: Character, context: RuleContext): Feature[];
}

// a feature made by a rule module, origin is what the tooltips show for it
export const ruleFeature = (origin: string, adjustments: Feature['adjustments']): Feature =>
  new Feature({id: `rule:${origin}`, name: origin, description: origin, adjustments, active: true});
