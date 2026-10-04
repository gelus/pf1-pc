import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Size, sizes } from '../interfaces/character.interface';
import { Armor, Item, Purse, Slot, Weapon } from '../utils/item.class';
import { EditFeatureArrayComponent } from '../edit-feature-array/edit-feature-array.component';

export type ItemKind = 'Wondrous Item' | 'Weapon' | 'Armor';

export const ITEM_SLOTS: Slot[] = [
  'head', 'headband', 'eyes', 'shoulders', 'neck', 'chest', 'body',
  'armor', 'belt', 'wrists', 'hands', 'ring', 'feet', 'held', 'slotless',
];

@Component({
  selector: 'app-item-form',
  imports: [CommonModule, FormsModule, EditFeatureArrayComponent],
  templateUrl: './item-form.component.html',
  styleUrl: './item-form.component.sass',
})
export class ItemFormComponent implements OnInit, OnChanges {
  @Input() item: Item & Partial<Weapon> & Partial<Armor> = new Item();
  @Input() itemKind: ItemKind = 'Wondrous Item';
  @Output() itemChange = new EventEmitter<Item>();
  @Output() itemKindChange = new EventEmitter<ItemKind>();

  readonly slots = ITEM_SLOTS;
  readonly sizes = sizes;

  specialText = '';
  speed30 = 20;
  speed20 = 15;

  ngOnInit(): void {
    this.syncFromItem();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['item']) {
      this.syncFromItem();
    }
  }

  syncFromItem(): void {
    if (!this.item) {
      this.item = new Item();
    }
    if (!this.item.cost) {
      this.item.cost = new Purse();
    }
    if (!Array.isArray(this.item.features)) {
      this.item.features = [];
    }

    if ('category' in this.item || 'special' in this.item) {
      this.itemKind = 'Weapon';
    } else if ('speed' in this.item || this.item.slot === 'armor') {
      this.itemKind = 'Armor';
    }

    this.specialText = Array.isArray(this.item.special) ? this.item.special.join(', ') : '';
    if (Array.isArray(this.item.speed)) {
      this.speed30 = this.item.speed[0] ?? 20;
      this.speed20 = this.item.speed[1] ?? 15;
    }
  }

  onKindSelect(newKind: ItemKind): void {
    this.itemKind = newKind;
    this.itemKindChange.emit(newKind);
  }

  get isGear(): boolean {
    return this.itemKind === 'Weapon' || this.itemKind === 'Armor' || 'proficiency' in this.item || 'size' in this.item;
  }

  get isWeapon(): boolean {
    return this.itemKind === 'Weapon' || 'category' in this.item || 'special' in this.item;
  }

  get isArmor(): boolean {
    return this.itemKind === 'Armor' || 'speed' in this.item;
  }

  onSpecialChange(value: string): void {
    this.specialText = value;
    this.item.special = (value || '').split(',').map(s => s.trim()).filter(Boolean);
    this.emitChange();
  }

  onSpeedChange(): void {
    this.item.speed = [Number(this.speed30) || 0, Number(this.speed20) || 0];
    this.emitChange();
  }

  emitChange(): void {
    this.itemChange.emit(this.item);
  }
}
