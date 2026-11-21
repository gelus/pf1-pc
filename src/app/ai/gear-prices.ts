// the prices the AI gets wrong in a kit, put right where the gear is priced and bought: ammunition is sold by the
// bundle (10 bolts for 1 gp, which the AI priced 1 gp a bolt), and the starting outfit is free (it charged 10 gp for
// the explorer's outfit). the price of one is cost_gp, as create_item and price_gear take it

interface Bundle {
  name: RegExp;
  // the price of one piece, in gp
  each: number;
  sold: string;
}

const BUNDLES: Bundle[] = [
  {name: /\barrows?\b/i, each: 0.05, sold: '20 arrows for 1 gp'},
  {name: /\b(crossbow )?bolts?\b/i, each: 0.1, sold: '10 bolts for 1 gp'},
  {name: /\b(sling )?bullets?\b/i, each: 0.01, sold: '10 sling bullets for 1 sp'},
  {name: /\bblowgun darts?\b/i, each: 0.05, sold: '10 blowgun darts for 5 sp'},
];

// special ammunition costs what its page says
const SPECIAL = /\+\d|masterwork|\bmwk\b|silver|cold iron|adamantine|blunt|durable|flaming|frost|shock|holy|bane|alchemical|smoke|tanglefoot|thunderstone|scroll|wand|potion|firearm|pistol|musket|metal cartridge/i;

// how many pieces one of the item is: "Arrows (20)", "20 arrows", "bundle of 10 bolts", or one
const piecesIn = (name: string): number => {
  const count = /\((\d+)\)|\b(\d+)\s*(arrows?|bolts?|bullets?|darts?)\b|\bbundle of (\d+)\b/i.exec(name);
  const n = Number(count?.[1] ?? count?.[2] ?? count?.[4]);
  return n > 0 ? n : 1;
};

const OUTFIT = /\boutfit\b|\bclothes\b|\bclothing\b/i;

// the price of one of the item, put right when the AI got it wrong, and why. firstOutfitFree: the character has no
// outfit yet, so the first one is the free starting outfit
export const fairPrice = (
  name: string, cost: number, quantity: number, options: {firstOutfitFree?: boolean} = {},
): {cost: number, note?: string} => {
  if (options.firstOutfitFree && OUTFIT.test(name) && cost > 0) {
    return {cost: 0, note: `${name}: the starting outfit is free (one more costs ${cost} gp)`};
  }
  const bundle = SPECIAL.test(name) ? undefined : BUNDLES.find(b => b.name.test(name));
  if (!bundle) return {cost};
  const right = Math.round(bundle.each * piecesIn(name) * 100) / 100;
  if (Math.abs(right - cost) < 0.005) return {cost};
  return {cost: right, note: `${name}: ${bundle.sold}, so ${quantity > 1 ? 'each costs ' : ''}${right} gp, not ${cost} gp`};
};

export const hasOutfit = (inventory: {name?: string, slot?: string}[] = []): boolean =>
  inventory.some(item => OUTFIT.test(item.name || ''));

// an item that is not one: a "bundle" or "assorted gear" the AI priced at a guess (an Adventuring Gear Bundle for
// 0.1 gp). each piece is bought by its own name and price
const VAGUE = /\b(bundle of gear|gear bundle|gear pack|adventuring gear|assorted|miscellaneous|misc\.?|various|sundries|supplies)\b/i;
export const vagueItem = (name: string): boolean => VAGUE.test(name);

// what a kit leaves out that the character needs: ammunition for its bows, crossbows and slings, and the outfit
// starting characters get free
const SHOOTS: [RegExp, RegExp, string][] = [
  [/\b(short|long)?bow\b/i, /\barrows?\b/i, 'arrows (20 for 1 gp)'],
  [/\bcrossbow\b/i, /\bbolts?\b/i, 'bolts (10 for 1 gp)'],
  [/\bsling\b/i, /\b(sling )?bullets?\b/i, 'sling bullets (10 for 1 sp)'],
];
export const kitGaps = (names: string[], hasOutfitAlready: boolean): string[] => [
  ...SHOOTS.filter(([weapon, ammo]) => names.some(n => weapon.test(n) && !ammo.test(n)) && !names.some(n => ammo.test(n)))
    .map(([, , ammo]) => `ammunition for it: ${ammo}`),
  ...(hasOutfitAlready || names.some(n => OUTFIT.test(n)) ? [] : ['an outfit (the first is free: explorer\'s outfit)']),
];
