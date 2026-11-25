import { ClassSpellcasting, Feature } from  '../interfaces/character.interface';

// how fast a class gains its base attack bonus: full (1 per level), threeQuarters (3/4) and half (1/2)
export type BabProgression = 'full' | 'threeQuarters' | 'half';
export type SaveName = 'fort' | 'ref' | 'will';
// what a level in a favored class gives: an extra hit point, an extra skill rank, or an alternate bonus (a feature)
export type FavoredClassBonus = 'hp' | 'skill' | 'other';

export interface Proficiencies {
  // weapon names, or the groups 'simple' and 'martial'
  weapons: string[];
  // 'light', 'medium', 'heavy', 'shield', 'tower shield'
  armor: string[];
}

// an archetype of a class (APG, chapter 2): it trades class features of the class for its own. the features it gives
// are the class levels' features like any other, this is what it takes away, so a later level of the class leaves the
// replaced ones out and a second archetype can not trade the same feature again
export interface Archetype {
  name: string;
  // the class features of the class it replaces, by the names the class page gives them ("Uncanny Dodge")
  replaces: string[];
  // those it changes rather than replaces (a rage that gives other bonuses): still gained, as the archetype writes them
  alters?: string[];
  // picks of a class feature it trades while the feature stays (the rage powers gained at 4th, 8th and 12th level), as
  // its page says them: told, never left out of the class
  partial?: string[];
  // the class skills it adds and those it takes off the class's list
  classSkills?: {add?: string[], remove?: string[]};
  // the weapon and armor proficiencies it adds and takes off the class's
  proficiencies?: {add?: Partial<Proficiencies>, remove?: Partial<Proficiencies>};
  // how it changes the class's spellcasting: 'none' when the class casts no spells with it (a skirmisher ranger), else
  // what changes, as add_class_level's spellcasting is written ({"ability": "int"}, {"spells_per_day_change": -1},
  // {"extra_slot": "none"}), merged over the class's own (ai/spells.ts, spellcastingFrom with a base)
  spellcasting?: 'none' | {[change: string]: unknown};
  sourceUrl?: string;
}

// every entry of classLevels is one character level: the third barbarian level is its own entry, with level 3
// so the character level is the number of entries, see characterLevel
export class ClassLevel {
  name: string = '';
  features: Feature[] = [];
  hitDice: number = 6;
  rolledHp:number = 0;
  classSkills: string[] = [];
  skillRanks: number = 0;
  startingWealth: number = 0;
  // which level of this class the entry is, not how many levels it holds
  level: number = 1;
  babProgression?: BabProgression;
  // the saves the class has a good progression in, the others progress poorly
  goodSaves?: SaveName[];
  favoredClassBonus?: FavoredClassBonus;
  // with favoredClassBonus 'other': the id of the race's alternate favored class bonus picked (Race.favoredClassOptions)
  favoredClassOption?: string;
  // the ability score raised at this character level (every 4th character level raises one)
  abilityIncrease?: string;
  // the proficiencies the class grants, usually listed on the first level of the class only
  proficiencies?: Proficiencies;
  // the alignments the class allows, as its page says it ("any nonlawful", "lawful good"), when it limits them
  alignment?: string;
  // a spellcasting class, see rules/spellcasting.ts. the first entry of the class that gives it counts
  spellcasting?: ClassSpellcasting;
  // the archetypes taken at this level of the class (usually its first), see archetypesOf for all of a class's
  archetypes?: Archetype[];
  // the spellcasting classes this level advances ("+1 level of existing spellcasting class": a prestige class's), by
  // their names: their spells per day, spells known and caster level as if they had gained a level, nothing else
  advancesCasting?: string[];
  // a prestige class's requirements as its page lists them, kept on its first level (rules/prerequisites.ts)
  requirements?: string;
  // a prestige class's level: its good saves progress as a prestige class's (+1 at 1st), see saveFor
  prestige?: boolean;

  constructor(initialValues?: Partial<ClassLevel>) {
    if(initialValues) Object.assign(this, initialValues)
  }
}

// the archetypes of a class, taken at any of its levels, each once
export const archetypesOf = (levels: ClassLevel[] | undefined, className: string): Archetype[] => {
  const name = className.trim().toLowerCase();
  return (levels || []).filter(l => (l.name || '').trim().toLowerCase() === name).flatMap(l => l.archetypes || []);
};

// the name of a class feature as archetypes and class tables name it: "Bravery +1" and "bravery" are one feature,
// "Rage Powers" and "rage power", "Uncanny Dodge (Ex)" and "uncanny dodge". "Improved Uncanny Dodge" is another
export const featureKey = (name: string): string => name.toLowerCase()
  .replace(/[’‘`]/g, "'").replace(/\([^)]*\)/g, '').replace(/[+-]?\d*d\d+/g, '')
  .replace(/[+-]?\d+(st|nd|rd|th)?\b|\b[ivx]+\s*$/g, '').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/s$/, '');

// the character level, every class level entry is one level
export const characterLevel = (char: {classLevels?: ClassLevel[]}): number => char.classLevels?.length || 0;
