import {TRAINED_ONLY_SKILLS, canUseSkill, getSkillList, isTrainedOnly, skillAbilityMap} from './skilllist.class';

describe('trained only skills', () => {
  it('lists the skills of the core rulebook that can not be used untrained', () => {
    expect([...TRAINED_ONLY_SKILLS].sort()).toEqual([
      'disable device', 'handle animal', 'knowledge', 'linguistics', 'profession', 'sleight of hand', 'spellcraft',
      'use magic device',
    ]);
    // every one of them is a skill of the list
    for (const name of TRAINED_ONLY_SKILLS) expect(name in skillAbilityMap).withContext(name).toBeTrue();
  });

  it('tells a trained only skill apart, in any case', () => {
    expect(isTrainedOnly('Use Magic Device')).toBeTrue();
    expect(isTrainedOnly('knowledge')).toBeTrue();
    expect(isTrainedOnly('acrobatics')).toBeFalse();
    expect(isTrainedOnly('craft')).toBeFalse();
    expect(isTrainedOnly('perform')).toBeFalse();
  });

  it('needs a rank to use a trained only skill, not to use any other', () => {
    const skills = getSkillList();
    expect(canUseSkill('spellcraft', skills['spellcraft'])).toBeFalse();
    expect(canUseSkill('spellcraft', {...skills['spellcraft'], ranks: 1})).toBeTrue();
    expect(canUseSkill('knowledge', skills['knowledge'].subSkills!['arcana'])).toBeFalse();
    expect(canUseSkill('knowledge', {ranks: 2})).toBeTrue();
    expect(canUseSkill('climb', skills['climb'])).toBeTrue();
    expect(canUseSkill('profession', undefined)).toBeFalse();
  });
});
