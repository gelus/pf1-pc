import { RemainingRanksPipe } from './remaining-ranks.pipe';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';

describe('RemainingRanksPipe', () => {
  it('create an instance', () => {
    const pipe = new RemainingRanksPipe();
    expect(pipe).toBeTruthy();
  });

  it('counts ordinary skills and subSkills while ignoring family ranks', () => {
    const pipe = new RemainingRanksPipe();
    const char = new Character();
    char.classLevels = [new ClassLevel({ skillRanks: 4, level: 1 }), new ClassLevel({ skillRanks: 4, level: 2 })];
    char.skills['acrobatics'].ranks = 2;
    char.skills['knowledge'].ranks = 99;
    char.skills['knowledge'].subSkills!['arcana'].ranks = 1;
    char.skills['craft'].ranks = 50;
    char.skills['craft'].subSkills!['pottery'] = {
      name: 'pottery',
      ranks: 2,
      value: 0,
      classSkill: false,
      baseAbility: 'int',
    };

    expect(pipe.transform(char)).toBe('3/8');
  });

  it('counts each class level entry as one level, whatever level of its class it is', () => {
    const pipe = new RemainingRanksPipe();
    const char = new Character();
    char.classLevels = [1, 2, 3].map(level => new ClassLevel({ skillRanks: 2, level }));
    expect(pipe.transform(char)).toBe('6/6');
  });

  it('adds a rank for every favored class level that takes the skill rank bonus', () => {
    const pipe = new RemainingRanksPipe();
    const char = new Character();
    char.favoredClasses = ['rogue'];
    char.classLevels = [
      new ClassLevel({ name: 'Rogue', skillRanks: 8, level: 1, favoredClassBonus: 'skill' }),
      new ClassLevel({ name: 'Rogue', skillRanks: 8, level: 2, favoredClassBonus: 'hp' }),
      // not a favored class, its bonus does not count
      new ClassLevel({ name: 'Fighter', skillRanks: 2, level: 1, favoredClassBonus: 'skill' }),
    ];
    expect(pipe.transform(char)).toBe('19/19');
  });

  it('takes the Int modifier with the penalty of the Int damage', () => {
    const pipe = new RemainingRanksPipe();
    const char = new Character();
    char.abilityScores.int = 14;
    char.abilityDamage = {int: 2};
    char.classLevels = [new ClassLevel({ skillRanks: 2, level: 1 })];
    // 2 + 2 (Int 14) - 1 (2 points of Int damage)
    expect(pipe.transform(char)).toBe('3/3');
  });
});
