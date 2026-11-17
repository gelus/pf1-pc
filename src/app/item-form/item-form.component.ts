import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Adjustments, Feature, Size, sizes } from '../interfaces/character.interface';
import { ARMOR_CATEGORIES, Armor, Item, Purse, SHIELD_CATEGORIES, Shield, Slot, Weapon } from '../utils/item.class';
import { EditFeatureArrayComponent } from '../edit-feature-array/edit-feature-array.component';
import { isShield } from '../utils/equipment.util';

export type ItemKind = 'Wondrous Item' | 'Weapon' | 'Armor' | 'Shield';

// the kind of item the form shows for an item: a shield first (it is held like a weapon), then a weapon, then armor
export const itemKindOf = (item: Item): ItemKind => {
  if (isShield(item)) return 'Shield';
  if ('category' in item || 'special' in item) return 'Weapon';
  if ('speed' in item || 'armorCategory' in item || item.slot === 'armor') return 'Armor';
  return 'Wondrous Item';
};

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
  @Input() item: Item & Partial<Weapon> & Partial<Armor> & Partial<Shield> = new Item();
  @Input() itemKind: ItemKind = 'Wondrous Item';
  @Output() itemChange = new EventEmitter<Item>();
  @Output() itemKindChange = new EventEmitter<ItemKind>();

  readonly slots = ITEM_SLOTS;
  readonly sizes = sizes;
  readonly armorCategories = ARMOR_CATEGORIES;
  readonly shieldCategories = SHIELD_CATEGORIES;

  specialText = '';
  speed30 = 20;
  speed20 = 15;
  // the limits armor (or a shield) puts on its wearer, kept in the adjustments of the item's first feature
  // the max dex bonus caps the dex bonus to ac (a min adjustment), null for armor that does not limit it
  maxDexBonus: number | null = null;
  armorCheckPenalty = 0;
  // the armor (or shield) bonus to ac, and the arcane spell failure chance in %
  acBonus = 0;
  spellFailure = 0;

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

    const kind = itemKindOf(this.item);
    if (kind !== 'Wondrous Item') this.itemKind = kind;

    this.specialText = Array.isArray(this.item.special) ? this.item.special.join(', ') : '';
    if (Array.isArray(this.item.speed)) {
      this.speed30 = this.item.speed[0] ?? 20;
      this.speed20 = this.item.speed[1] ?? 15;
    }
    const adjustments = this.item.features[0]?.adjustments || {};
    const maxDex: any = adjustments['maxDexBonus'];
    const maxDexValue = maxDex && typeof maxDex === 'object' ? maxDex.value : maxDex;
    this.maxDexBonus = maxDexValue === undefined || maxDexValue === null || maxDexValue === '' || Number.isNaN(Number(maxDexValue))
      ? null
      : Number(maxDexValue);
    this.armorCheckPenalty = Number(adjustments['armorCheckPenalty']) || 0;
    const ac: any = adjustments['ac'];
    this.acBonus = Number(ac && typeof ac === 'object' ? ac.value : ac) || 0;
    this.spellFailure = Number(adjustments['arcaneSpellFailureChance']) || 0;
  }

  // the ac bonus is an armor bonus for armor and a shield bonus for a shield, so two shields do not stack and a
  // touch attack ignores both
  onAcBonusChange(): void {
    this.armorAdjustments()['ac'] = {value: Number(this.acBonus) || 0, type: this.isShield ? 'shield' : 'armor'};
    this.emitChange();
  }

  onSpellFailureChange(): void {
    this.armorAdjustments()['arcaneSpellFailureChance'] = Number(this.spellFailure) || 0;
    this.emitChange();
  }

  // the adjustments armor applies to its wearer, those of its first feature
  private armorAdjustments(): Adjustments {
    if (!this.item.features.length) this.item.features.push(new Feature({name: this.item.name, adjustments: {}}));
    const feature = this.item.features[0];
    if (!feature.adjustments) feature.adjustments = {};
    return feature.adjustments;
  }

  onArmorLimitsChange(): void {
    const adjustments = this.armorAdjustments();
    const maxDex = this.maxDexBonus as number | string | null;
    if (maxDex === null || maxDex === undefined || maxDex === '' || Number.isNaN(Number(maxDex))) {
      // armor that does not limit the dex bonus does not cap it at all
      delete adjustments['maxDexBonus'];
    } else {
      adjustments['maxDexBonus'] = {value: Number(maxDex), mode: 'min'};
    }
    adjustments['armorCheckPenalty'] = Number(this.armorCheckPenalty) || 0;
    this.emitChange();
  }

  onKindSelect(newKind: ItemKind): void {
    this.itemKind = newKind;
    this.itemKindChange.emit(newKind);
  }

  get isGear(): boolean {
    return this.itemKind === 'Weapon' || this.itemKind === 'Armor' || this.itemKind === 'Shield'
      || 'proficiency' in this.item || 'size' in this.item;
  }

  get isWeapon(): boolean {
    return this.itemKind === 'Weapon' || (!this.isShield && ('category' in this.item || 'special' in this.item));
  }

  get isShield(): boolean {
    return this.itemKind === 'Shield' || isShield(this.item);
  }

  get isArmor(): boolean {
    return !this.isShield && (this.itemKind === 'Armor' || 'speed' in this.item);
  }

  // the fields armor and shields share: their category, ac bonus, max dex, check penalty and spell failure
  get isProtective(): boolean {
    return this.isArmor || this.isShield;
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

  // the hands a held item takes, empty for the default (see handsFor): one, none for a buckler
  onHandsChange(value: number | string | null): void {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) delete this.item.hands;
    else this.item.hands = Math.max(0, Number(value));
    this.emitChange();
  }

  emitChange(): void {
    this.itemChange.emit(this.item);
  }
}
