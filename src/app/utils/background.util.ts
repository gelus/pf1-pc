import {Character} from './character.class';

// Pathfinder 1e character traits and drawbacks
// see https://www.d20pfsrd.com/traits/ and https://www.d20pfsrd.com/traits/drawbacks/

// a character starts out with two traits, and takes one more for each drawback it takes on.
// bonusTraits counts the ones features give on top of that (the additional traits feat gives two)
export const STARTING_TRAITS = 2;

export const traitsAllowed = (char: Character): number =>
  STARTING_TRAITS + (char.drawbacks || []).length + (Number(char.bonusTraits) || 0);

export const traitsUsed = (char: Character): number => (char.traits || []).length;
