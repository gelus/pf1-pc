import { Component, EventEmitter, HostBinding, Output } from '@angular/core';
import {FormsModule} from '@angular/forms';
import {CommonModule} from '@angular/common';
import {Armor, Item, Weapon} from '../utils/item.class';

const itemTemplate: {[type: string]: Item|Weapon|Armor} = {
  Other: new Item(),
  Weapon: new Weapon(),
  Armor: new Armor(),
}

const getNewItem = (type: string = 'Other'): Item => JSON.parse(JSON.stringify(itemTemplate[type]));

@Component({
  selector: 'app-item-modal',
  imports: [FormsModule, CommonModule],
  templateUrl: './item-modal.component.html',
  styleUrl: './item-modal.component.sass'
})
export class ItemModalComponent {
  @Output() itemUpdate = new EventEmitter<Item>();
  @HostBinding('class.open') private open: boolean = false;

  item: Item = getNewItem();

  confirm() {
    console.log('confirm', this.item)
    this.itemUpdate.emit(this.item);

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
      const item = JSON.parse(adj.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''))
      Object.assign(this.item, item);
    } catch (e) {/* swallow it */}
  }

}
