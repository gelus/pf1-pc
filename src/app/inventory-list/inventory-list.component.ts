import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import {ConditionsService} from '../conditions.service';
import {Character} from '../utils/character.class';
import {ItemModalComponent} from '../item-modal/item-modal.component';
import {Item} from '../utils/item.class';
import {PurseToStringPipe, RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {FormsModule} from '@angular/forms';
import {ApplyCharacterService} from '../apply-character.service';
import {LOAD_EFFECTS, Load} from '../utils/encumbrance.util';
import {handsFor, itemsToUnequip} from '../utils/equipment.util';

const signed = (n: number): string => (n > 0 ? '+' : '') + n;


@Component({
  selector: 'app-inventory-list',
  imports: [FormsModule, ItemModalComponent, RemainingStartingWealthPipe, PurseToStringPipe],
  templateUrl: './inventory-list.component.html',
  styleUrl: './inventory-list.component.sass'
})
export class InventoryListComponent {

  @Output() inventoryChange = new EventEmitter<Partial<Character>>();
  @Input() newCharacterMode: boolean = true;
  // the sheet's search: only the items whose name or slot has it
  @Input() filter = '';

  // an item melded into the form the character is in (rules/forms.ts): greyed out, its armor and attacks set aside
  melded(item: {id?: string}): boolean {
    return !!this.character.applied().setAside?.items.some(melded => melded.id === item.id);
  }

  itemShown(item: {name?: string, slot?: string}): boolean {
    const query = this.filter.trim().toLowerCase();
    return !query || [item.name, item.slot].some(text => (text || '').toLowerCase().includes(query));
  }

  anyItemShown(): boolean {
    return (this.character.raw().inventory || []).some(item => this.itemShown(item));
  }

  emitInventoryChange(key: 'inventory'|'wealth') {
    this.inventoryChange.emit({[key]: this.character.raw()[key]});
  }

  constructor(
    public character: ApplyCharacterService
  ) {}

  // what equipping the last item took off, so the player sees why an item is no longer equipped
  equipNotice = '';

  // equipping an item takes off whatever no longer fits its slot (or the character's two hands, for a held item),
  // see itemsToUnequip: the items listed first in the inventory (added first) are taken off first, the notice says
  // which
  equipItem(item: Item) { // item will come in with the new equipped state
    this.equipNotice = '';
    if (item.equipped) {
      // an equipped item is carried
      item.carried = true;
      const freed = itemsToUnequip(item, this.character.raw().inventory);
      for (const other of freed) other.equipped = false;
      if (freed.length) {
        const room = item.slot === 'held' ? (handsFor(item) > 1 ? 'both hands' : 'a hand') : `the ${item.slot} slot`;
        this.equipNotice = `Unequipped ${freed.map(other => other.name).join(', ')} to free ${room} for ${item.name}.`;
      }
    }
    this.inventoryChange.emit({inventory: this.character.raw().inventory});
  }

  itemUpdate(item: Item) {
    if (!this.character.raw().inventory.includes(item)) this.character.raw().inventory.push(item);
    this.inventoryChange.emit({inventory: this.character.raw().inventory});
  }

  private conditions = inject(ConditionsService);

  loadGuideOpen = false;

  // the weights the current load spans for this character's carrying capacity
  loadRange(char: Character): string {
    const {light, medium, heavy} = char.carryingCapacity;
    switch (char.load) {
      case 'light': return `up to ${light} lbs.`;
      case 'medium': return `more than ${light}, up to ${medium} lbs.`;
      case 'heavy': return `more than ${medium}, up to ${heavy} lbs.`;
      default: return `more than ${heavy} lbs.`;
    }
  }

  // what the current load actually does to the character
  // a load does not stack with armor, so its max dex bonus, check penalty and speed reduction only show
  // when they apply rather than the armor's
  loadEffects(char: Character): string[] {
    const condition = this.conditions.loadConditions[char.load];
    const effects = LOAD_EFFECTS[char.load];
    if (!condition || !effects) return ['No effects'];

    const map = this.character.adjustmentsMap;
    const applies = (path: string) => (map[path] || []).some(e => e.origin === condition.name && !e.variant && !e.overwritten);
    const speedReducedByOther = (map['speed.land'] || [])
      .some(e => !e.variant && e.value === 'reduced' && e.origin !== condition.name);

    const lines: string[] = [];
    if (applies('maxDexBonus')) lines.push(`Dex bonus to AC capped at ${signed(effects.maxDexBonus)}`);
    if (applies('armorCheckPenalty')) lines.push(`${effects.armorCheckPenalty} check penalty on Str and Dex based skills`);
    if (!speedReducedByOther && (char.speed.land ?? 0) > 0) lines.push(`Speed reduced to ${char.speed.land} ft.`);
    lines.push(`Runs at x${effects.runMultiplier} speed`);
    lines.push(`Counts as ${char.load === 'medium' ? 'medium' : 'heavy'} armor for abilities restricted by armor`);
    if (char.load === 'overloaded') lines.push('Treated as a heavy load by the sheet');
    return lines;
  }

  loadLabel(load: Load): string {
    return load === 'overloaded' ? 'Overloaded' : `${load[0].toUpperCase()}${load.slice(1)} load`;
  }

  // the weight of all of an item there is
  itemWeight(item: Item): number {
    return Math.round((Number(item.weight) || 0) * (Number(item.quantity ?? 1) || 0) * 100) / 100;
  }

  // an item left behind weighs nothing, and can not be equipped either
  carryItem(item: Item, carried: boolean) {
    item.carried = carried;
    if (!carried) item.equipped = false;
    this.inventoryChange.emit({inventory: this.character.raw().inventory});
  }

  removeItem(item: Item) {
    const ind = this.character.raw().inventory.indexOf(item);
    if (ind > -1) {
      this.character.raw().inventory.splice(ind, 1);
      this.inventoryChange.emit({inventory: this.character.raw().inventory});
    }
  }

}
