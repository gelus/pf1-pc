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
  // the ability score raised at this character level (every 4th character level raises one)
  abilityIncrease?: string;
  // the proficiencies the class grants, usually listed on the first level of the class only
  proficiencies?: Proficiencies;
  // the alignments the class allows, as its page says it ("any nonlawful", "lawful good"), when it limits them
  alignment?: string;
  // a spellcasting class, see rules/spellcasting.ts. the first entry of the class that gives it counts
  spellcasting?: ClassSpellcasting;

  constructor(initialValues?: Partial<ClassLevel>) {
    if(initialValues) Object.assign(this, initialValues)
  }
}

// the character level, every class level entry is one level
export const characterLevel = (char: {classLevels?: ClassLevel[]}): number => char.classLevels?.length || 0;
