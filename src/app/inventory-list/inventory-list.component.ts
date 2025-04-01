import { Component, EventEmitter, Input, Output } from '@angular/core';
import {Character} from '../utils/character.class';
import {ItemModalComponent} from '../item-modal/item-modal.component';
import {Item} from '../utils/item.class';

@Component({
  selector: 'app-inventory-list',
  imports: [ItemModalComponent],
  templateUrl: './inventory-list.component.html',
  styleUrl: './inventory-list.component.sass'
})
export class InventoryListComponent {

  @Output() inventoryChange = new EventEmitter<Partial<Character>>();
  @Input() char!: Character;
  @Input() budget: number = 0;

  addItem(item: Item) {
    this.char.inventory.push(item);
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
