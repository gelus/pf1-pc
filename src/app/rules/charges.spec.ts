import {chargesPer} from '../interfaces/character.interface';

describe('chargesPer', () => {
  it('takes per when it is set', () => {
    expect(chargesPer({total: 3, current: 1, label: 'rages per day', per: 'none'})).toBe('none');
    expect(chargesPer({total: 3, current: 1, per: 'encounter'})).toBe('encounter');
    expect(chargesPer({total: 3, current: 1, per: 'day'})).toBe('day');
  });

  it('goes by the label of charges saved without per', () => {
    expect(chargesPer({total: 4, current: 4, label: 'rages per day'})).toBe('day');
    expect(chargesPer({total: 4, current: 4, label: 'rounds/day'})).toBe('day');
    expect(chargesPer({total: 3, current: 3, label: '3/Day'})).toBe('day');
    expect(chargesPer({total: 1, current: 1, label: 'Daily'})).toBe('day');
    expect(chargesPer({total: 1, current: 1, label: 'per encounter'})).toBe('encounter');
  });

  it('never comes back by itself when the label says neither', () => {
    expect(chargesPer({total: 50, current: 12, label: 'charges'})).toBe('none');
    expect(chargesPer({total: 1, current: 1, label: ''})).toBe('none');
    expect(chargesPer({total: 1, current: 1})).toBe('none');
    expect(chargesPer(undefined)).toBe('none');
    // a word that only holds "day" is not a day
    expect(chargesPer({total: 1, current: 1, label: 'birthday candles'})).toBe('none');
  });
});
