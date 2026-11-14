import {
  CARRYING_CAPACITY,
  REDUCED_SPEED,
  carryingCapacity,
  loadFor,
  purseWeight,
  reducedSpeed,
} from './encumbrance.util';

describe('encumbrance', () => {
  describe('carryingCapacity', () => {
    it('reads the capacity of a medium biped off the table', () => {
      expect(carryingCapacity(10)).toEqual({light: 33, medium: 66, heavy: 100});
      expect(carryingCapacity(18)).toEqual({light: 100, medium: 200, heavy: 300});
      expect(carryingCapacity(29)).toEqual({light: 466, medium: 933, heavy: 1400});
      expect(carryingCapacity(1)).toEqual({light: 3, medium: 6, heavy: 10});
    });

    it('carries nothing without strength', () => {
      expect(carryingCapacity(0)).toEqual({light: 0, medium: 0, heavy: 0});
      expect(carryingCapacity(-2)).toEqual({light: 0, medium: 0, heavy: 0});
    });

    it('multiplies the row with the same ones digit by 4 for every 10 points of strength above 29', () => {
      expect(carryingCapacity(30)).toEqual({light: 532, medium: 1064, heavy: 1600});
      expect(carryingCapacity(35)).toEqual({light: 1064, medium: 2132, heavy: 3200});
      expect(carryingCapacity(39)).toEqual({light: 1864, medium: 3732, heavy: 5600});
      expect(carryingCapacity(40)).toEqual({light: 2128, medium: 4256, heavy: 6400});
      expect(carryingCapacity(41)).toEqual({light: 2448, medium: 4896, heavy: 7360});
    });

    it('scales with the size of a biped, dropping fractions of a lb.', () => {
      expect(carryingCapacity(10, 3)).toEqual({light: 24, medium: 49, heavy: 75}); // small x3/4
      expect(carryingCapacity(10, 5)).toEqual({light: 66, medium: 132, heavy: 200}); // large x2
      expect(carryingCapacity(10, 0)).toEqual({light: 4, medium: 8, heavy: 12}); // fine x1/8
      expect(carryingCapacity(10, 8)).toEqual({light: 528, medium: 1056, heavy: 1600}); // colossal x16
    });

    it('scales quadrupeds by their own multipliers', () => {
      expect(carryingCapacity(10, 4, true)).toEqual({light: 49, medium: 99, heavy: 150}); // medium x1.5
      expect(carryingCapacity(10, 3, true)).toEqual({light: 33, medium: 66, heavy: 100}); // small x1
      expect(carryingCapacity(18, 5, true)).toEqual({light: 300, medium: 600, heavy: 900}); // large x3
    });

    it('has a row for every strength score from 1 to 29', () => {
      for (let str = 1; str <= 29; str++) {
        const {light, medium, heavy} = CARRYING_CAPACITY[str];
        expect(light).toBeLessThan(medium);
        expect(medium).toBeLessThan(heavy);
      }
    });
  });

  describe('loadFor', () => {
    const capacity = carryingCapacity(10);
    it('includes the upper limit of a load in it', () => {
      expect(loadFor(0, capacity)).toBe('light');
      expect(loadFor(33, capacity)).toBe('light');
      expect(loadFor(66, capacity)).toBe('medium');
      expect(loadFor(100, capacity)).toBe('heavy');
    });

    it('counts any amount above a limit towards the next load', () => {
      expect(loadFor(33.02, capacity)).toBe('medium');
      expect(loadFor(66.5, capacity)).toBe('heavy');
      expect(loadFor(100.1, capacity)).toBe('overloaded');
    });
  });

  describe('reducedSpeed', () => {
    it('follows the reduced speed table', () => {
      expect(reducedSpeed(30)).toBe(20);
      expect(reducedSpeed(20)).toBe(15);
      expect(reducedSpeed(25)).toBe(20);
      expect(reducedSpeed(35)).toBe(25);
      expect(reducedSpeed(40)).toBe(30);
      expect(reducedSpeed(50)).toBe(35);
      expect(reducedSpeed(55)).toBe(40);
      expect(reducedSpeed(5)).toBe(5);
      expect(reducedSpeed(15)).toBe(10);
      expect(reducedSpeed(120)).toBe(80);
    });

    it('keeps reducing past the table the way the table does', () => {
      for (const [speed, reduced] of Object.entries(REDUCED_SPEED)) {
        expect(Number(speed) - Math.floor(Number(speed) / 15) * 5).toBe(reduced);
      }
      expect(reducedSpeed(150)).toBe(100);
      expect(reducedSpeed(125)).toBe(85);
    });

    it('leaves a speed of 0 alone', () => {
      expect(reducedSpeed(0)).toBe(0);
    });
  });

  describe('purseWeight', () => {
    it('weighs 50 coins to the lb., whatever they are', () => {
      expect(purseWeight({pp: 10, gp: 25, sp: 10, cp: 5})).toBe(1);
      expect(purseWeight({gp: 75})).toBe(1.5);
      expect(purseWeight(undefined)).toBe(0);
    });
  });
});
