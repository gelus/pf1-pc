import {Purse} from './item.class';

// Pathfinder 1e carrying capacity and encumbrance
// see https://www.d20pfsrd.com/alignment-description/carrying-capacity/

export type Load = 'light' | 'medium' | 'heavy' | 'overloaded';

export interface CarryingCapacity {
  // the most a character can carry for each load, anything above heavy overloads it
  light: number;
  medium: number;
  heavy: number;
}

// carrying capacity of a medium biped by strength score, the upper limit of each load in lbs.
// a light load is that many lbs. or less, a medium load more than the light limit up to the medium one, ...
export const CARRYING_CAPACITY: {[str: number]: CarryingCapacity} = {
  1: {light: 3, medium: 6, heavy: 10},
  2: {light: 6, medium: 13, heavy: 20},
  3: {light: 10, medium: 20, heavy: 30},
  4: {light: 13, medium: 26, heavy: 40},
  5: {light: 16, medium: 33, heavy: 50},
  6: {light: 20, medium: 40, heavy: 60},
  7: {light: 23, medium: 46, heavy: 70},
  8: {light: 26, medium: 53, heavy: 80},
  9: {light: 30, medium: 60, heavy: 90},
  10: {light: 33, medium: 66, heavy: 100},
  11: {light: 38, medium: 76, heavy: 115},
  12: {light: 43, medium: 86, heavy: 130},
  13: {light: 50, medium: 100, heavy: 150},
  14: {light: 58, medium: 116, heavy: 175},
  15: {light: 66, medium: 133, heavy: 200},
  16: {light: 76, medium: 153, heavy: 230},
  17: {light: 86, medium: 173, heavy: 260},
  18: {light: 100, medium: 200, heavy: 300},
  19: {light: 116, medium: 233, heavy: 350},
  20: {light: 133, medium: 266, heavy: 400},
  21: {light: 153, medium: 306, heavy: 460},
  22: {light: 173, medium: 346, heavy: 520},
  23: {light: 200, medium: 400, heavy: 600},
  24: {light: 233, medium: 466, heavy: 700},
  25: {light: 266, medium: 533, heavy: 800},
  26: {light: 306, medium: 613, heavy: 920},
  27: {light: 346, medium: 693, heavy: 1040},
  28: {light: 400, medium: 800, heavy: 1200},
  29: {light: 466, medium: 933, heavy: 1400},
};

// carrying capacity multipliers by size, in the order of sizes (Fine ... Colossal)
export const BIPED_SIZE_MULTIPLIERS = [1/8, 1/4, 1/2, 3/4, 1, 2, 4, 8, 16];
export const QUADRUPED_SIZE_MULTIPLIERS = [1/4, 1/2, 3/4, 1, 1.5, 3, 6, 12, 24];

// the effects of a load, a light load has none
// a load and armor do not stack, the worse figure of the two applies for each of these
export interface LoadEffects {
  maxDexBonus: number;
  armorCheckPenalty: number;
  // a medium or heavy load reduces speed, see REDUCED_SPEED
  reducesSpeed: boolean;
  runMultiplier: number;
}

export const LOAD_EFFECTS: {[load in Load]?: LoadEffects} = {
  medium: {maxDexBonus: 3, armorCheckPenalty: -3, reducesSpeed: true, runMultiplier: 4},
  heavy: {maxDexBonus: 1, armorCheckPenalty: -6, reducesSpeed: true, runMultiplier: 3},
  // more than a heavy load can only be staggered around with, as far as the sheet goes it is a heavy load
  overloaded: {maxDexBonus: 1, armorCheckPenalty: -6, reducesSpeed: true, runMultiplier: 3},
};

// the speed of a character slowed by medium or heavy armor or load, by its base speed in ft.
export const REDUCED_SPEED: {[speed: number]: number} = {
  5: 5, 10: 10, 15: 10, 20: 15, 25: 20, 30: 20, 35: 25, 40: 30, 45: 30, 50: 35, 55: 40, 60: 40,
  65: 45, 70: 50, 75: 50, 80: 55, 85: 60, 90: 60, 95: 65, 100: 70, 105: 70, 110: 75, 115: 80, 120: 80,
};

// a speed past the table keeps reducing by 5 ft. for every full 15 ft. of it, which is what the table does
export const reducedSpeed = (speed: number): number => {
  if (speed <= 0) return speed;
  return REDUCED_SPEED[speed] ?? speed - Math.floor(speed / 15) * 5;
};

// coins weigh 50 to the lb.
export const COINS_PER_LB = 50;

export const purseWeight = (purse?: Partial<Purse>): number => {
  if (!purse) return 0;
  const coins = (Number(purse.pp) || 0) + (Number(purse.gp) || 0) + (Number(purse.sp) || 0) + (Number(purse.cp) || 0);
  return coins / COINS_PER_LB;
};

// the carrying capacity of a medium biped of a strength score
// above 29, the row from 20 to 29 with the same ones digit is multiplied by 4 for every 10 points above it
const mediumBipedCapacity = (str: number): CarryingCapacity => {
  if (str <= 0) return {light: 0, medium: 0, heavy: 0};
  if (str <= 29) return {...CARRYING_CAPACITY[str]};
  const row = 20 + (str % 10);
  const factor = Math.pow(4, Math.floor((str - row) / 10));
  const base = CARRYING_CAPACITY[row];
  return {light: base.light * factor, medium: base.medium * factor, heavy: base.heavy * factor};
};

// the carrying capacity of a character, by its strength score and size (an index into sizes)
// fractions of a lb. a smaller creature can not quite carry are dropped
export const carryingCapacity = (str: number, size: number = 4, quadruped: boolean = false): CarryingCapacity => {
  const capacity = mediumBipedCapacity(Math.floor(Number(str) || 0));
  const multipliers = quadruped ? QUADRUPED_SIZE_MULTIPLIERS : BIPED_SIZE_MULTIPLIERS;
  const multiplier = multipliers[Math.min(Math.max(Math.round(size), 0), multipliers.length - 1)];
  return {
    light: Math.floor(capacity.light * multiplier),
    medium: Math.floor(capacity.medium * multiplier),
    heavy: Math.floor(capacity.heavy * multiplier),
  };
};

// the load a weight makes up for a carrying capacity
export const loadFor = (weight: number, capacity: CarryingCapacity): Load => {
  if (weight <= capacity.light) return 'light';
  if (weight <= capacity.medium) return 'medium';
  if (weight <= capacity.heavy) return 'heavy';
  return 'overloaded';
};
