import {AdvancementTrack} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';

// Pathfinder 1e experience points, Core Rulebook table 3-1: character advancement
// the xp a character needs to reach each character level, on the slow, medium and fast advancement tracks
// index 0 is level 1, which every character starts at
export const XP_TABLE: {[track in AdvancementTrack]: number[]} = {
  slow: [
    0, 3000, 7500, 14000, 23000, 35000, 53000, 77000, 115000, 160000,
    235000, 330000, 475000, 665000, 955000, 1350000, 1900000, 2700000, 3850000, 5350000,
  ],
  medium: [
    0, 2000, 5000, 9000, 15000, 23000, 35000, 51000, 75000, 105000,
    155000, 220000, 315000, 445000, 635000, 890000, 1300000, 1800000, 2550000, 3600000,
  ],
  fast: [
    0, 1300, 3300, 6000, 10000, 15000, 23000, 34000, 50000, 71000,
    105000, 145000, 210000, 295000, 425000, 600000, 850000, 1200000, 1700000, 2400000,
  ],
};

// the xp needed to reach a character level, undefined past level 20
export const xpForLevel = (level: number, track: AdvancementTrack = 'medium'): number | undefined =>
  (XP_TABLE[track] || XP_TABLE.medium)[level - 1];

// the xp the character needs for its next level, undefined once it reached level 20
export const nextLevelXp = (char: Pick<Character, 'classLevels' | 'advancementTrack'>): number | undefined =>
  xpForLevel(characterLevel(char) + 1, char.advancementTrack);

// whether the character has the xp for a level it has not taken yet
export const levelUpAvailable = (char: Pick<Character, 'classLevels' | 'advancementTrack' | 'experience'>): boolean => {
  const next = nextLevelXp(char);
  return next !== undefined && (Number(char.experience) || 0) >= next;
};
