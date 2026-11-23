import { Pipe, PipeTransform } from '@angular/core';
import {Character} from '../utils/character.class';
import {Item, Purse} from '../utils/item.class';
import {purseToCopper, purseToString, copperToPurse} from '../utils/wealth.util';
import {startingWealthOf} from '../rules/starting-wealth';

@Pipe({
  name: 'remainingStartingWealth'
})
export class RemainingStartingWealthPipe implements PipeTransform {

  transform(character: Character, maxDenomination = 'gp'): Purse {
    // the gold of its class, or the wealth of its level for a character made above 1st (rules/starting-wealth.ts)
    const startingWealth = startingWealthOf(character);
    const copper = startingWealth*100;
    // an item costs its price for each of it bought, an item saved without a quantity is a single one
    const spentCoppers = character.inventory.reduce(
      (cur: number, item: Item) => cur + purseToCopper(item.cost) * (item.quantity ?? 1),
      0,
    );
    const remainingCopper = copper-spentCoppers;
    return copperToPurse(remainingCopper, maxDenomination);
  }

}

@Pipe({
  name: 'purseToString'
})
export class PurseToStringPipe implements PipeTransform {

  transform(purse: Purse): string {
    return purseToString(purse);
  }

}

