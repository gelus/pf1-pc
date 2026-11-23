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

// what ammunition is called, by the words its name uses (arrows, bolts, sling bullets, ...)
export const AMMUNITION = /\b(arrows?|bolts?|bullets?|darts?|ammunition|shots?|stones?|cartridges?|pellets?)\b/i;

// the weight of one piece, from what the AI gave, and what was put right (told to the AI). a weight is per piece: the
// quantity multiplies it. ammunition's page weighs the bundle (10 bolts, 1 lb.): a piece weighing a pound or more in
// a bundle of 10 or more is the bundle's weight, over its count (the bolts of a wizard weighed 10 lbs.). weapons and
// armor are listed for a Medium creature: a Small one's weigh half, a Large one's twice (Core Rulebook, chapter 6);
// for other sizes the AI gives the weight itself
export const sizedWeight = (
  name: string, type: string, weight: number, quantity: number, size: number,
): {weight: number, notes: string[]} => {
  const notes: string[] = [];
  let piece = weight;
  if (AMMUNITION.test(name) && quantity >= 10 && piece >= 1) {
    piece = Math.round((piece / quantity) * 1000) / 1000;
    notes.push(`${name}: ${weight} lb. is the weight of the bundle of ${quantity}, ${piece} lb. each`);
  }
  if (['weapon', 'armor', 'shield'].includes(type) && piece > 0 && (size === 3 || size === 5)) {
    const sized = size === 3 ? piece / 2 : piece * 2;
    notes.push(`${name}: sized for a ${size === 3 ? 'Small' : 'Large'} character, ${sized} lb. (${piece} lb. for a Medium one)`);
    piece = sized;
  }
  return {weight: piece, notes};
};

// what a load does to the character, in words, as the rules give it (see ConditionsService loadConditions)
export const loadEffects = (load: string): string => load === 'overloaded'
  ? 'it can not move'
  : load === 'heavy' ? 'max Dex bonus +1, -6 armor check penalty, slower speed, runs at x3'
  : load === 'medium' ? 'max Dex bonus +3, -3 armor check penalty, slower speed, runs at x4' : 'nothing';

