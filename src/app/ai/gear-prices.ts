// the creation's rules for gear, where it is priced and bought: the starting outfit is free (the AI charged 10 gp for
// the explorer's outfit), and an item is one item, never a bundle of gear. the price of one is cost_gp, as
// create_item and price_gear take it; what an item costs is the AI's to read from its page

const OUTFIT = /\boutfit\b|\bclothes\b|\bclothing\b/i;

// the price of one of the item, put right when the AI got it wrong, and why. firstOutfitFree: the character has no
// outfit yet, so the first one is the free starting outfit
export const fairPrice = (
  name: string, cost: number, _quantity: number, options: {firstOutfitFree?: boolean} = {},
): {cost: number, note?: string} => {
  if (options.firstOutfitFree && OUTFIT.test(name) && cost > 0) {
    return {cost: 0, note: `${name}: the starting outfit is free (one more costs ${cost} gp)`};
  }
  return {cost};
};

export const hasOutfit = (inventory: {name?: string, slot?: string}[] = []): boolean =>
  inventory.some(item => OUTFIT.test(item.name || ''));

// an item that is not one: a "bundle" or "assorted gear" the AI priced at a guess (an Adventuring Gear Bundle for
// 0.1 gp). each piece is bought by its own name and price
const VAGUE = /\b(bundle of gear|gear bundle|gear pack|adventuring gear|assorted|miscellaneous|misc\.?|various|sundries|supplies)\b/i;
export const vagueItem = (name: string): boolean => VAGUE.test(name);

// what a kit leaves out that the character needs: the outfit starting characters get free
export const kitGaps = (names: string[], hasOutfitAlready: boolean): string[] =>
  hasOutfitAlready || names.some(n => OUTFIT.test(n)) ? [] : ['an outfit (the first is free: explorer\'s outfit)'];
