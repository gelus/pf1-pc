import {sizes} from '../interfaces/character.interface';

// Pathfinder 1e size modifiers and how damage dice change with size
// see https://www.d20pfsrd.com/basics-ability-scores/glossary/#Size and the Paizo FAQ on damage dice progression

// a size is an index into sizes (Fine ... Colossal), anything outside of that is treated as the nearest size
export const clampSize = (size: number): number =>
  Math.min(sizes.length - 1, Math.max(0, Math.round(Number(size) || 0)));

// the modifiers of each size, in the order of sizes (Fine ... Colossal), a medium creature has none
// the size modifier applies to AC and attack rolls
export const SIZE_MODIFIER = [8, 4, 2, 1, 0, -1, -2, -4, -8];
// the special size modifier applies to CMB and CMD, the bigger the better
export const SPECIAL_SIZE_MODIFIER = [-8, -4, -2, -1, 0, 1, 2, 4, 8];
export const FLY_SIZE_MODIFIER = [8, 6, 4, 2, 0, -2, -4, -6, -8];
export const STEALTH_SIZE_MODIFIER = [16, 12, 8, 4, 0, -4, -8, -12, -16];

// the damage dice progression chart of the Paizo FAQ "size changes, effective size changes, and damage dice
// progression" (https://paizo.com/paizo/faq/v5748nruor1fm#v5748eaic9t3f), each entry is one step
export const DAMAGE_DICE_PROGRESSION = [
  '1', '1d2', '1d3', '1d4', '1d6', '1d8', '1d10', '2d6', '2d8', '3d6', '3d8',
  '4d6', '4d8', '6d6', '6d8', '8d6', '8d8', '12d6', '12d8', '16d6',
];

const SMALL = 3;
const MEDIUM = 4;
const ONE_D6 = DAMAGE_DICE_PROGRESSION.indexOf('1d6');
const ONE_D8 = DAMAGE_DICE_PROGRESSION.indexOf('1d8');

interface Dice {
  count: number;
  die: number;
}

const diceString = ({count, die}: Dice): string => die === 1 ? String(count) : `${count}d${die}`;
const average = ({count, die}: Dice): number => count * (die + 1) / 2;
const parseEntry = (entry: string): Dice => {
  const [count, die] = entry.split('d').map(Number);
  return {count, die: die ?? 1};
};
const CHART = DAMAGE_DICE_PROGRESSION.map(parseEntry);
const countsOnChart = (die: number): number[] => CHART.filter(d => d.die === die).map(d => d.count);

// the step of the chart some dice stand for. dice that are not on the chart are converted first, as the FAQ says:
//  a number of d6 not on the chart counts as the next lowest number of d6 on it, but as d8 (10d6 counts as 8d8)
//  a number of d8 not on the chart counts as the next highest number of d8 on it, but as d6 (5d8 counts as 6d6)
//  2d4 counts as 1d8, 3d4 as 2d6, and so on (every two d4 are a d8, an odd number of d4 is half of it plus one d6)
//  1d12 counts as 2d6, and so on (every d12 is two d6)
// dice beyond the chart count as its last step, other dice (d3s, d20s, ...) as the step closest to them on average
const chartStep = (dice: Dice): number => {
  const {count, die} = dice;
  const exact = CHART.findIndex(d => d.count === count && d.die === die);
  if (exact !== -1) return exact;
  if (die === 4) return chartStep(count % 2 ? {count: (count + 1) / 2, die: 6} : {count: count / 2, die: 8});
  if (die === 12) return chartStep({count: count * 2, die: 6});
  if (die === 6) {
    const lower = countsOnChart(6).filter(c => c < count).pop();
    if (lower !== undefined) return chartStep({count: lower, die: 8});
  }
  if (die === 8) {
    const higher = countsOnChart(8).find(c => c > count);
    return higher === undefined ? CHART.length - 1 : chartStep({count: higher, die: 6});
  }
  // the closest step on average, the lower one when two are just as close
  const avg = average(dice);
  return CHART.reduce((best, d, i) =>
    Math.abs(average(d) - avg) < Math.abs(average(CHART[best]) - avg) ? i : best, 0);
};

// the dice after a change of one size up or down from size
//  up:   two steps, but only one if the size is Small or lower or the damage 1d6 or less
//  down: two steps, but only one if the size is Medium or lower or the damage 1d8 or less
// 2d10 goes up to 4d8 and down to 2d8 whatever the size, and so on for more d10
const scaleOneSize = (dice: Dice, size: number, up: boolean): Dice => {
  if (dice.die === 10 && dice.count > 1) return {count: up ? dice.count * 2 : dice.count, die: 8};
  const step = chartStep(dice);
  const steps = up
    ? (size <= SMALL || step <= ONE_D6 ? 1 : 2)
    : (size <= MEDIUM || step <= ONE_D8 ? 1 : 2);
  const next = Math.min(CHART.length - 1, Math.max(0, step + (up ? steps : -steps)));
  return CHART[next];
};

// the damage dice of a weapon (or natural attack) of fromSize at toSize, one size at a time
// only the leading dice change, whatever follows them stays as it is ("1d8+2" of a medium longsword is "2d6+2" when
// large). a damage that does not start with dice (a flat number other than 1, a formula, ...) is given back as it is
export const scaleDamageDice = (dice: string, fromSize: number, toSize: number): string => {
  const match = /^\s*(\d*)d(\d+)(.*)$/i.exec(dice) ?? /^\s*(1)()(\s*[+-].*)?$/.exec(dice);
  if (!match) return dice;
  const [, count, die, rest] = match;
  let current: Dice = {count: count === '' ? 1 : Number(count), die: die === '' ? 1 : Number(die)};
  if (current.count < 1 || current.die < 1) return dice;

  let size = clampSize(fromSize);
  const target = clampSize(toSize);
  if (size === target) return dice;
  while (size !== target) {
    const up = target > size;
    current = scaleOneSize(current, size, up);
    size += up ? 1 : -1;
  }
  return diceString(current) + (rest ?? '');
};
