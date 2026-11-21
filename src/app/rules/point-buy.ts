import {ABILITIES} from './class-progression';

// a point buy (Core Rulebook, ability scores): what each base score costs, before racial modifiers, and the points
// a campaign usually gives (low, standard, high, epic fantasy)
export const POINT_BUY_COST: {[score: number]: number} = {
  7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17,
};
export const POINT_BUY_BUDGETS = [10, 15, 20, 25];
export const POINT_BUY_MIN = 7;
export const POINT_BUY_MAX = 18;

// what the scores cost in all, NaN when one is outside 7-18
export const pointBuyTotal = (scores: {[ability: string]: number}): number =>
  ABILITIES.reduce((sum, ability) => sum + (POINT_BUY_COST[scores[ability]] ?? NaN), 0);
