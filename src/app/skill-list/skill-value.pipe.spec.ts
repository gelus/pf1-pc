import { SkillValuePipe } from './skill-value.pipe';
import { Character } from '../utils/character.class';

describe('SkillValuePipe', () => {
  it('create an instance', () => {
    const pipe = new SkillValuePipe();
    expect(pipe).toBeTruthy();
  });

  it('includes skillCheckBonus and armorCheckPenalty for str/dex skills only', () => {
    const pipe = new SkillValuePipe();
    const char = new Character();
    char.abilityScores.dex = 14;
    char.abilityScores.wis = 14;
    char.skillCheckBonus = -2;
    char.armorCheckPenalty = -4;

    char.skills['acrobatics'].ranks = 1;
    char.skills['acrobatics'].classSkill = true;
    expect(pipe.transform(char.skills['acrobatics'], char)).toBe(0);

    char.skills['perception'].ranks = 1;
    char.skills['perception'].classSkill = true;
    expect(pipe.transform(char.skills['perception'], char)).toBe(4);
  });
});
