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
