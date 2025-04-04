import { Component, EventEmitter, HostBinding, Output } from '@angular/core';
import {FormsModule} from '@angular/forms';
import {CommonModule} from '@angular/common';
import {Armor, Item, Weapon} from '../utils/item.class';

const itemBase = {
  name: 'new Item',
  type: 'other',
  cost: 0,
  equipable: false,
  description: '',
  features: [],
  weight: 0,
  quantity: 1,
}

const itemTemplate: {[type: string]: Item|Weapon|Armor} = {
  Other: {...itemBase},
  Weapon: {
    ...itemBase,
    name: 'New Weapon',
    type: 'weapon',
    equipable: true,
    category: '',
    damage: '',
    criticalRange: 0,
    criticalMultiplier: 2,
    range: 0,
    damageType: 'B',
    special: [],
  },
  Armor: {
    ...itemBase,
    name: 'New Armor',
    type: 'armor',
    equipable: true,
    armorBonus: 0,
    maxDexBonus: 0,
    armorCheckPenalty: 0,
    arcaneSpellFailureChance: 0,
    speed: [],
  }
}

const getNewItem = (type: string = 'Other'): Item => JSON.parse(JSON.stringify(itemTemplate[type]));

@Component({
  selector: 'app-item-modal',
  imports: [FormsModule, CommonModule],
  templateUrl: './item-modal.component.html',
  styleUrl: './item-modal.component.sass'
})
export class ItemModalComponent {
  @Output() itemCreated = new EventEmitter<Item>();
  @HostBinding('class.open') private open: boolean = false;

  item: Item = getNewItem();

  confirm() {
    console.log('confirm', this.item)
    this.itemCreated.emit(this.item);

    this.closeModal()
  }

  openModal(openOption?: string | Item) {
    this.item = typeof openOption === 'object' ? openOption : getNewItem();
    this.open = true;
  }

  closeModal() {
    this.open = false;
    this.item = getNewItem();
  }

  typeChange(e: any) {
    this.item = getNewItem(e.target.value);
  }

  consumeItemString(adj: any) {
    try {
      this.item = JSON.parse(adj.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''))
    } catch (e) {/* swallow it */}
  }

}
