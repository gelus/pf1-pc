import {Character} from '../utils/character.class';

// what a new character starts with to buy its gear (Core Rulebook, chapter 6, starting wealth, and chapter 12, table
// 12-4 Character Wealth by Level): a 1st-level character the gold of its class (ClassLevel.startingWealth, rolled or the
// class's average), a character made at a higher level the wealth of a character of that level, in gp
export const WEALTH_BY_LEVEL: {[level: number]: number} = {
  2: 1000, 3: 3000, 4: 6000, 5: 10500, 6: 16000, 7: 23500, 8: 33000, 9: 46000, 10: 62000, 11: 82000,
  12: 108000, 13: 140000, 14: 185000, 15: 240000, 16: 315000, 17: 410000, 18: 530000, 19: 685000, 20: 880000,
};

// the level the character was made at, 1st for one saved before it
export const startingLevelOf = (char: Pick<Character, 'startingLevel'>): number =>
  Math.min(20, Math.max(1, Math.floor(Number(char.startingLevel) || 1)));

export const startingWealthOf = (char: Pick<Character, 'startingLevel' | 'classLevels'>): number => {
  const level = startingLevelOf(char);
  return level > 1 ? WEALTH_BY_LEVEL[level] : Number(char.classLevels?.[0]?.startingWealth) || 0;
};
