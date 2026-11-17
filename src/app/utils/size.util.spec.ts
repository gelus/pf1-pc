import {
  FLY_SIZE_MODIFIER,
  SIZE_MODIFIER,
  SPECIAL_SIZE_MODIFIER,
  STEALTH_SIZE_MODIFIER,
  clampSize,
  scaleDamageDice,
} from './size.util';

// sizes: 0 Fine, 1 Diminutive, 2 Tiny, 3 Small, 4 Medium, 5 Large, 6 Huge, 7 Gargantuan, 8 Colossal
const FINE = 0, DIMINUTIVE = 1, TINY = 2, SMALL = 3, MEDIUM = 4, LARGE = 5, HUGE = 6, GARGANTUAN = 7, COLOSSAL = 8;

describe('size', () => {
  describe('modifiers', () => {
    it('gives the modifiers of every size, none for medium', () => {
      expect(SIZE_MODIFIER).toEqual([8, 4, 2, 1, 0, -1, -2, -4, -8]);
      expect(SPECIAL_SIZE_MODIFIER).toEqual([-8, -4, -2, -1, 0, 1, 2, 4, 8]);
      expect(FLY_SIZE_MODIFIER).toEqual([8, 6, 4, 2, 0, -2, -4, -6, -8]);
      expect(STEALTH_SIZE_MODIFIER).toEqual([16, 12, 8, 4, 0, -4, -8, -12, -16]);
    });

    it('treats a size outside of Fine ... Colossal as the nearest size', () => {
      expect(clampSize(-2)).toBe(FINE);
      expect(clampSize(12)).toBe(COLOSSAL);
      expect(clampSize(5)).toBe(LARGE);
      expect(clampSize(NaN)).toBe(FINE);
    });
  });

  describe('scaleDamageDice', () => {
    // the medium weapon damage of the core rulebook (table 6-5) and the small and large damage of it
    const weapons: [string, string, string][] = [
      // medium, small, large
      ['1d2', '1', '1d3'],
      ['1d3', '1d2', '1d4'],
      ['1d4', '1d3', '1d6'],
      ['1d6', '1d4', '1d8'],
      ['1d8', '1d6', '2d6'],
      ['1d10', '1d8', '2d8'],
      ['1d12', '1d10', '3d6'],
      ['2d4', '1d6', '2d6'],
      ['2d6', '1d10', '3d6'],
      ['2d8', '2d6', '3d8'],
      ['2d10', '2d8', '4d8'],
    ];
    for (const [medium, small, large] of weapons) {
      it(`scales a medium ${medium} to ${small} when small and ${large} when large`, () => {
        expect(scaleDamageDice(medium, MEDIUM, SMALL)).toBe(small);
        expect(scaleDamageDice(medium, MEDIUM, LARGE)).toBe(large);
      });
    }

    it('scales two steps at a time above small, through every size up to colossal', () => {
      expect(scaleDamageDice('1d8', MEDIUM, HUGE)).toBe('3d6');
      expect(scaleDamageDice('1d8', MEDIUM, GARGANTUAN)).toBe('4d6');
      expect(scaleDamageDice('1d8', MEDIUM, COLOSSAL)).toBe('6d6');
      expect(scaleDamageDice('2d6', MEDIUM, COLOSSAL)).toBe('8d6');
      expect(scaleDamageDice('1d10', MEDIUM, COLOSSAL)).toBe('6d8');
      expect(scaleDamageDice('3d6', LARGE, COLOSSAL)).toBe('8d6');
      expect(scaleDamageDice('4d6', HUGE, COLOSSAL)).toBe('8d6');
    });

    it('scales one step at a time from small or lower, or from damage of 1d6 or less', () => {
      // a small longsword wielded by a medium creature
      expect(scaleDamageDice('1d6', SMALL, MEDIUM)).toBe('1d8');
      // the damage of a small creature is not treated as that of a medium one
      expect(scaleDamageDice('1d10', SMALL, MEDIUM)).toBe('2d6');
      expect(scaleDamageDice('1d8', SMALL, MEDIUM)).toBe('1d10');
      expect(scaleDamageDice('1d4', TINY, SMALL)).toBe('1d6');
      expect(scaleDamageDice('1d2', FINE, MEDIUM)).toBe('1d8');
      expect(scaleDamageDice('1d6', MEDIUM, LARGE)).toBe('1d8');
      expect(scaleDamageDice('1d4', LARGE, HUGE)).toBe('1d6');
    });

    it('scales down one step at a time from medium or lower, or from damage of 1d8 or less', () => {
      expect(scaleDamageDice('1d8', MEDIUM, FINE)).toBe('1d2');
      expect(scaleDamageDice('1d8', MEDIUM, TINY)).toBe('1d4');
      expect(scaleDamageDice('1d8', MEDIUM, DIMINUTIVE)).toBe('1d3');
      expect(scaleDamageDice('1d8', LARGE, MEDIUM)).toBe('1d6');
      expect(scaleDamageDice('1d6', HUGE, LARGE)).toBe('1d4');
    });

    it('scales down two steps at a time above medium for damage above 1d8', () => {
      expect(scaleDamageDice('2d6', LARGE, MEDIUM)).toBe('1d8');
      expect(scaleDamageDice('3d6', LARGE, MEDIUM)).toBe('2d6');
      expect(scaleDamageDice('2d8', LARGE, MEDIUM)).toBe('1d10');
      expect(scaleDamageDice('3d6', HUGE, MEDIUM)).toBe('1d8');
      expect(scaleDamageDice('6d6', COLOSSAL, MEDIUM)).toBe('1d8');
      expect(scaleDamageDice('1d10', LARGE, MEDIUM)).toBe('1d6');
    });

    it('goes back to the same damage when a medium weapon grows and shrinks again', () => {
      for (const dice of ['1d4', '1d6', '1d8', '1d10', '2d6', '2d8']) {
        expect(scaleDamageDice(scaleDamageDice(dice, MEDIUM, LARGE), LARGE, MEDIUM)).toBe(dice);
      }
    });

    it('converts a number of d6 or d8 not on the chart before scaling it', () => {
      // 10d6 counts as 8d8, 5d6 as 4d8
      expect(scaleDamageDice('10d6', MEDIUM, LARGE)).toBe('12d8');
      expect(scaleDamageDice('5d6', LARGE, MEDIUM)).toBe('3d8');
      // 5d8 counts as 6d6, 7d8 as 8d6
      expect(scaleDamageDice('5d8', MEDIUM, LARGE)).toBe('8d6');
      expect(scaleDamageDice('7d8', HUGE, LARGE)).toBe('6d6');
    });

    it('converts d4 and d12 before scaling them', () => {
      // 2d4 counts as 1d8, 3d4 as 2d6, 4d4 as 2d8
      expect(scaleDamageDice('3d4', MEDIUM, LARGE)).toBe('3d6');
      expect(scaleDamageDice('4d4', MEDIUM, LARGE)).toBe('3d8');
      expect(scaleDamageDice('2d4', LARGE, MEDIUM)).toBe('1d6');
      // 1d12 counts as 2d6, 2d12 as 4d6
      expect(scaleDamageDice('2d12', MEDIUM, LARGE)).toBe('6d6');
      expect(scaleDamageDice('1d12', LARGE, MEDIUM)).toBe('1d8');
    });

    it('scales 2d10 up to 4d8 and down to 2d8 whatever the size, and so on for more d10', () => {
      expect(scaleDamageDice('2d10', SMALL, MEDIUM)).toBe('4d8');
      expect(scaleDamageDice('2d10', HUGE, LARGE)).toBe('2d8');
      expect(scaleDamageDice('3d10', MEDIUM, LARGE)).toBe('6d8');
      expect(scaleDamageDice('3d10', MEDIUM, SMALL)).toBe('3d8');
      // the 4d8 of a large 2d10 is on the chart again
      expect(scaleDamageDice('2d10', MEDIUM, HUGE)).toBe('6d8');
    });

    it('treats other dice as the step closest to them on average', () => {
      // 1d20 averages 10.5 like 3d6
      expect(scaleDamageDice('1d20', MEDIUM, LARGE)).toBe('4d6');
      // 2d3 averages 4, between 1d6 and 1d8, the lower one counts
      expect(scaleDamageDice('2d3', MEDIUM, LARGE)).toBe('1d8');
    });

    it('stops at the ends of the chart', () => {
      expect(scaleDamageDice('16d6', MEDIUM, LARGE)).toBe('16d6');
      expect(scaleDamageDice('12d8', LARGE, HUGE)).toBe('16d6');
      expect(scaleDamageDice('1', MEDIUM, FINE)).toBe('1');
      expect(scaleDamageDice('1d2', SMALL, FINE)).toBe('1');
    });

    it('scales only the dice of a damage with a bonus', () => {
      expect(scaleDamageDice('1d8+2', MEDIUM, LARGE)).toBe('2d6+2');
      expect(scaleDamageDice('2d6 - 1', MEDIUM, SMALL)).toBe('1d10 - 1');
      expect(scaleDamageDice('1+1', MEDIUM, LARGE)).toBe('1d2+1');
      expect(scaleDamageDice('d6', MEDIUM, LARGE)).toBe('1d8');
    });

    it('leaves the damage as it is at the same size, and when it is not dice', () => {
      expect(scaleDamageDice('2d4', MEDIUM, MEDIUM)).toBe('2d4');
      expect(scaleDamageDice('5', MEDIUM, LARGE)).toBe('5');
      expect(scaleDamageDice('', MEDIUM, LARGE)).toBe('');
      expect(scaleDamageDice('0d6', MEDIUM, LARGE)).toBe('0d6');
    });

    it('treats sizes outside of Fine ... Colossal as the nearest size', () => {
      expect(scaleDamageDice('1d8', MEDIUM, 12)).toBe('6d6');
      expect(scaleDamageDice('1d8', MEDIUM, -3)).toBe('1d2');
    });
  });
});
