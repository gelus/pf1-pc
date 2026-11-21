import { CoinType, Purse } from './item.class';

export const purseToCopper = (purse: Purse): number => (
  purse.pp * 1000 +
  purse.gp * 100 +
  purse.sp * 10 +
  purse.cp
);

export const copperToPurse = (copper: number, maxDenomination = 'pp'): Purse => {
  const allDenominations: any = { pp: 1000, gp: 100, sp: 10, cp: 1 };

  const order = ['pp', 'gp', 'sp', 'cp'];
  const maxIndex = order.indexOf(maxDenomination);

  if (maxIndex === -1) throw new Error(`Invalid denomination: ${maxDenomination}`);

  const usableDenominations = order.slice(maxIndex);
  const result: any = new Purse();
  const isNegative = copper < 0;
  let remaining = Math.abs(copper);

  for (const coin of usableDenominations) {
    const value = allDenominations[coin];
    result[coin] = Math.floor(remaining / value);
    remaining %= value;
  }

  // Reapply sign if original value was negative
  if (isNegative) {
    for (const coin of usableDenominations) {
      result[coin] = -result[coin]!;
    }
  }

  return result;
}

export const purseToString = (purse: Purse) => {
  const ret = [];
  if (purse.pp) ret.push(`${purse.pp}Pp`)
  if (purse.gp) ret.push(`${purse.gp}Gp`)
  if (purse.sp) ret.push(`${purse.sp}Sp`)
  if (purse.cp) ret.push(`${purse.cp}Cp`)
  return ret.join(' ');
}

// a price in gp as coins: 0.1 gp is 1 sp, 2.5 gp is 2 gp 5 sp (a price is never written in platinum)
export const gpToPurse = (gp: number): Purse => copperToPurse(Math.round(gp * 100), 'gp');

// a price as it is said, in gp: a number is gp, "5 sp", "1 gp 5 sp", "2 cp", "1 pp"; NaN when it is neither
const COPPER_IN: {[coin: string]: number} = {pp: 1000, gp: 100, sp: 10, cp: 1};
export const priceInGp = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const said = String(value ?? '').toLowerCase().replace(/,/g, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(said)) return Number(said);
  const coins = [...said.matchAll(/(\d+(?:\.\d+)?)\s*(pp|gp|sp|cp)\b/g)];
  if (!coins.length || said.replace(/(\d+(?:\.\d+)?)\s*(pp|gp|sp|cp)\b/g, '').replace(/\band\b|\s/g, '')) return NaN;
  return coins.reduce((sum, [, n, coin]) => sum + Number(n) * COPPER_IN[coin], 0) / 100;
};
