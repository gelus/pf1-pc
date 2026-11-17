import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { XP_TABLE, levelUpAvailable, nextLevelXp, xpForLevel } from './experience';

const ofLevel = (count: number): ClassLevel[] => Array.from({length: count}, (_, i) => new ClassLevel({name: 'Fighter', level: i + 1}));

describe('experience', () => {
  it('has the xp of every level up to 20 on each track, growing level by level', () => {
    for (const track of ['slow', 'medium', 'fast'] as const) {
      expect(XP_TABLE[track].length).toBe(20);
      expect(XP_TABLE[track].every((xp, i) => i === 0 || xp > XP_TABLE[track][i - 1])).toBeTrue();
    }
    expect(xpForLevel(2, 'slow')).toBe(3000);
    expect(xpForLevel(2, 'medium')).toBe(2000);
    expect(xpForLevel(2, 'fast')).toBe(1300);
    expect(xpForLevel(20, 'medium')).toBe(3600000);
    expect(xpForLevel(21, 'medium')).toBeUndefined();
  });

  it('works out the xp of the next level from the character level and its track', () => {
    const char = new Character();
    char.classLevels = ofLevel(3);
    expect(nextLevelXp(char)).toBe(9000);
    char.advancementTrack = 'fast';
    expect(nextLevelXp(char)).toBe(6000);
    char.classLevels = ofLevel(20);
    expect(nextLevelXp(char)).toBeUndefined();
  });

  it('has a level up available once the xp reaches the next level', () => {
    const char = new Character();
    char.classLevels = ofLevel(1);
    char.experience = 1999;
    expect(levelUpAvailable(char)).toBeFalse();
    char.experience = 2000;
    expect(levelUpAvailable(char)).toBeTrue();
    // the level has been taken
    char.classLevels = ofLevel(2);
    expect(levelUpAvailable(char)).toBeFalse();
    char.classLevels = ofLevel(20);
    char.experience = 99999999;
    expect(levelUpAvailable(char)).toBeFalse();
  });
});
