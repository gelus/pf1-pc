import {Character} from '../utils/character.class';
import {abilityModifier} from '../ability-mod.pipe';
import {RuleContext, RuleModule} from './rule-module';

// the languages a character knows (core rulebook, chapter 2, races, languages, and chapter 4, linguistics):
//  the languages its race gives it, and whatever any other feature gives it (a feature adds to languages like a race)
//  plus bonus languages: one per point of its intelligence modifier (a penalty gives none), chosen from the list of
//  bonus languages of its race (that list is not checked, only counted)
//  plus one language per rank of linguistics
// languages stays the data: the character's own languages (the ones it chose) and those its features add. the rule
// merges them into one list and counts how many the character may know, see languagesAllowed

// languages are free text, a feature can give several at once separated by commas ('Common, Orc'). they compare in
// lowercase, the first spelling of a language is kept
export const splitLanguages = (value: any): string[] => {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value.flat() : [value])
    .filter(v => typeof v === 'string')
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(v => {
      const key = v.toLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

// the languages features gave the character (its race first of all), they cost no bonus language
export const grantedLanguages = (context: RuleContext): string[] =>
  splitLanguages((context.adjustmentsMap['languages'] || [])
    .filter(e => e.variant === undefined && !e.overwritten)
    .map(e => e.value));

// the bonus languages the character may know: its intelligence modifier and its ranks of linguistics
// the rules give the bonus languages of intelligence when the character is made, and the sheet does not keep the
// score it had then: its current score stands in for it. ability damage does not make it forget a language, so the
// modifier is that of the score alone
export const bonusLanguages = (applied: Character): number =>
  Math.max(0, abilityModifier({abilityScores: applied.abilityScores}, 'int')) +
  Math.max(0, Number(applied.skills?.['linguistics']?.ranks) || 0);

export const languagesRule: RuleModule = {
  name: 'languages',
  finalize(raw, applied, context) {
    applied.languages = splitLanguages(applied.languages);
    // a language the character listed itself and a feature gives as well is counted once, as given
    applied.languagesAllowed = grantedLanguages(context).length + bonusLanguages(applied);
  },
};
