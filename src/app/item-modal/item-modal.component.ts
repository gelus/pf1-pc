import { Component, EventEmitter, HostBinding, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Armor, Item, Weapon } from '../utils/item.class';
import { ItemFormComponent, ItemKind } from '../item-form/item-form.component';

const itemTemplate: {[type: string]: Item|Weapon|Armor} = {
  "Wondrous Item": new Item(),
  Weapon: new Weapon(),
  Armor: new Armor(),
};

const getNewItem = (type: string = 'Wondrous Item'): Item => JSON.parse(JSON.stringify(itemTemplate[type] || itemTemplate['Wondrous Item']));

@Component({
  selector: 'app-item-modal',
  imports: [FormsModule, CommonModule, ItemFormComponent],
  templateUrl: './item-modal.component.html',
  styleUrl: './item-modal.component.sass'
})
export class ItemModalComponent {
  @Output() itemUpdate = new EventEmitter<Item>();
  @HostBinding('class.open') open: boolean = false;

  item: Item = getNewItem();
  itemKind: ItemKind = 'Wondrous Item';

  confirm() {
    this.itemUpdate.emit(this.item);
    this.closeModal();
  }

  openModal(openOption?: string | Item) {
    if (typeof openOption === 'object' && openOption !== null) {
      this.item = openOption;
      if ('category' in openOption || 'special' in openOption) {
        this.itemKind = 'Weapon';
      } else if ('speed' in openOption || openOption.slot === 'armor') {
        this.itemKind = 'Armor';
      } else {
        this.itemKind = 'Wondrous Item';
      }
    } else {
      const kind = (typeof openOption === 'string' && openOption in itemTemplate) ? openOption as ItemKind : 'Wondrous Item';
      this.itemKind = kind;
      this.item = getNewItem(kind);
    }
    this.open = true;
  }

  closeModal() {
    this.open = false;
    this.item = getNewItem();
    this.itemKind = 'Wondrous Item';
  }

  typeChange(e: any) {
    const newKind: ItemKind = typeof e === 'string' ? e as ItemKind : e?.target?.value;
    if (!newKind) return;
    const prevId = this.item?.id;
    const prevQuantity = this.item?.quantity ?? 1;
    const prevEquipped = this.item?.equipped ?? false;
    this.itemKind = newKind;
    const nextItem = getNewItem(newKind);
    if (prevId) nextItem.id = prevId;
    nextItem.quantity = prevQuantity;
    nextItem.equipped = prevEquipped;
    this.item = nextItem;
  }

  consumeItemString(adj: any) {
    try {
      const item = JSON.parse(adj.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''));
      Object.assign(this.item, item);
    } catch (e) {/* swallow it */}
  }
}
