import { MaxLevelPipe } from './max-level.pipe';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';

describe('MaxLevelPipe', () => {
  it('create an instance', () => {
    const pipe = new MaxLevelPipe();
    expect(pipe).toBeTruthy();
  });

  it('is the number of class level entries, not the sum of their levels', () => {
    const char = new Character();
    char.classLevels = [
      new ClassLevel({ name: 'Fighter', level: 1 }),
      new ClassLevel({ name: 'Fighter', level: 2 }),
      new ClassLevel({ name: 'Rogue', level: 1 }),
    ];
    expect(new MaxLevelPipe().transform(char)).toBe(3);
  });
});
