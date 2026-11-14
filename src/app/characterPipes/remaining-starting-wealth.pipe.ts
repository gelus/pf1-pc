import { Pipe, PipeTransform } from '@angular/core';
import {Character} from '../utils/character.class';
import {Item, Purse} from '../utils/item.class';
import {purseToCopper, purseToString, copperToPurse} from '../utils/wealth.util';

@Pipe({
  name: 'remainingStartingWealth'
})
export class RemainingStartingWealthPipe implements PipeTransform {

  transform(character: Character, maxDenomination = 'gp'): Purse {
    const startingWealth = character.classLevels?.[0]?.startingWealth ?? 0;
    const copper = startingWealth*100;
    // an item costs its price for each of it bought
    const spentCoppers = character.inventory.reduce((cur: number, item: Item) => cur + purseToCopper(item.cost) * item.quantity, 0);
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

