import {statLabel} from './stat-label';

describe('statLabel', () => {
  it('names the stats of the sheet', () => {
    expect(statLabel('ac')).toBe('AC');
    expect(statLabel('flatFootedAc')).toBe('flat-footed AC');
    expect(statLabel('saves.will')).toBe('Will save');
    expect(statLabel('abilityScores.str')).toBe('Strength');
    expect(statLabel('speed.land')).toBe('speed');
  });

  it('names a skill, and a skill of a family with its family', () => {
    expect(statLabel('skills.stealth.value')).toBe('stealth');
    expect(statLabel('skills.sleightOfHand.value')).toBe('sleight of hand');
    expect(statLabel('skills.knowledge.subSkills.arcana.value')).toBe('knowledge (arcana)');
  });

  it('falls back to the words of the path, and to Total without one', () => {
    expect(statLabel('someNewStat')).toBe('some new stat');
    expect(statLabel(undefined)).toBe('Total');
  });
});
