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
    char.classLevels = [new ClassLevel({ skillRanks: 4, level: 2 })];
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
});
