import { AbilityModPipe, abilityDamagePenalty, abilityModifier } from './ability-mod.pipe';

describe('AbilityModPipe', () => {
  it('create an instance', () => {
    const pipe = new AbilityModPipe();
    expect(pipe).toBeTruthy();
  });

  describe('abilityModifier', () => {
    it('is the modifier of the score less 1 for every 2 points of damage', () => {
      const char = {abilityScores: {str: 15}, abilityDamage: {str: 3}};
      expect(abilityModifier(char, 'str')).toBe(1);
      expect(abilityDamagePenalty(char, 'str')).toBe(-1);
    });

    it('takes a character without damage (a raw character) as it is', () => {
      expect(abilityModifier({abilityScores: {int: 8}}, 'int')).toBe(-1);
      expect(abilityDamagePenalty({abilityScores: {int: 8}}, 'int')).toBe(0);
    });

    it('ignores negative or broken damage', () => {
      expect(abilityModifier({abilityScores: {dex: 14}, abilityDamage: {dex: -4}}, 'dex')).toBe(2);
      expect(abilityModifier({abilityScores: {dex: 14}, abilityDamage: {dex: 'x'}}, 'dex')).toBe(2);
    });

    it('caps the bonus before it takes the damage penalty', () => {
      expect(abilityModifier({abilityScores: {dex: 20}, abilityDamage: {dex: 4}}, 'dex', 1)).toBe(-1);
    });
  });
});
