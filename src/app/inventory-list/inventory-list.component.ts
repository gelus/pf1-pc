import { Component, EventEmitter, Input, Output } from '@angular/core';
import {Character} from '../utils/character.class';
import {ItemModalComponent} from '../item-modal/item-modal.component';
import {Item} from '../utils/item.class';
import {PurseToStringPipe, RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {FormsModule} from '@angular/forms';


@Component({
  selector: 'app-inventory-list',
  imports: [FormsModule, ItemModalComponent, RemainingStartingWealthPipe, PurseToStringPipe],
  templateUrl: './inventory-list.component.html',
  styleUrl: './inventory-list.component.sass'
})
export class InventoryListComponent {

  @Output() inventoryChange = new EventEmitter<Partial<Character>>();
  @Input() char!: Character;
  @Input() newCharacterMode: boolean = true;

  emitInventoryChange(key: 'inventory'|'wealth') {
    this.inventoryChange.emit({[key]: this.char[key]});
  }

  equipItem(item: Item) { // item will come in with the new equipped state
    if (item.equipped) {
      let ringsWorn = 1;  // default to the ring you just put on
      for (const oItem of this.char.inventory) {
        if (oItem.slot === item.slot && oItem !== item) {
          if (item.slot === 'ring') {
            if (ringsWorn === 2) oItem.equipped = false;
            else if (oItem.equipped) ringsWorn += 1;
          } else oItem.equipped = false
        }
      }
    }
    this.inventoryChange.emit({inventory: this.char.inventory});
  }

  itemUpdate(item: Item) {
    if (!this.char.inventory.includes(item)) this.char.inventory.push(item);
    this.inventoryChange.emit({inventory: this.char.inventory});
  }

  removeItem(item: Item) {
    const ind = this.char.inventory.indexOf(item);
    if (ind > -1) {
      this.char.inventory.splice(ind, 1);
      this.inventoryChange.emit({inventory: this.char.inventory});
    }
  }

}
