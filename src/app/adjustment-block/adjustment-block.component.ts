import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Optional, Output, SimpleChanges, forwardRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApplyCharacterService } from '../apply-character.service';
import { Adjustments, Feature } from '../interfaces/character.interface';
import { Attack, damageType } from '../utils/attack.class';
import { Character } from '../utils/character.class';
import { FeatureBlockComponent } from '../feature-block/feature-block.component';
import { SpellCastingEditorComponent, createEmptyCaster } from '../spell-casting-editor/spell-casting-editor.component';

export type AdjustmentValueType = 'number' | 'string' | 'typed' | 'feature' | 'attack' | 'spellCasting';

export interface AdjustmentEntry {
  key: string;
  valueType: AdjustmentValueType;
  value: any;
  isArrayAttack?: boolean;
}

export function collectCharacterFieldPaths(obj: any, prefix = '', visited = new Set<any>()): string[] {
  if (!obj || typeof obj !== 'object' || visited.has(obj)) return [];
  visited.add(obj);
  const paths: string[] = [];

  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    paths.push(fullPath);
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      paths.push(...collectCharacterFieldPaths(val, fullPath, visited));
    } else if (Array.isArray(val) && (key === 'melee' || key === 'ranged')) {
      const sampleAttack = new Attack();
      for (const atkField of Object.keys(sampleAttack)) {
        paths.push(`${fullPath}.*.${atkField}`);
      }
    }
  }
  return paths;
}

@Component({
  selector: 'app-adjustment-block',
  imports: [
    CommonModule,
    FormsModule,
    forwardRef(() => FeatureBlockComponent),
    forwardRef(() => SpellCastingEditorComponent),
  ],
  templateUrl: './adjustment-block.component.html',
  styleUrl: './adjustment-block.component.sass',
})
export class AdjustmentBlockComponent implements OnInit, OnChanges {
  @Input() adjustments: Adjustments = {};
  @Input() characterSource?: any;
  @Output() adjustmentsChange = new EventEmitter<Adjustments>();

  entries: AdjustmentEntry[] = [];
  openDropdownIndex: number | null = null;
  highlightedIndex = -1;

  readonly damageTypes: damageType[] = ['B', 'P', 'S'];

  constructor(@Optional() public characterService?: ApplyCharacterService) {}

  ngOnInit(): void {
    this.syncEntriesFromAdjustments();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['adjustments']) {
      this.syncEntriesFromAdjustments();
    }
  }

  getAvailableFields(): string[] {
    const fieldSet = new Set<string>();
    const sources = [
      new Character(),
      this.characterService?.raw?.(),
      this.characterService?.applied?.(),
      this.characterSource,
    ];
    for (const src of sources) {
      if (src) {
        for (const path of collectCharacterFieldPaths(src)) {
          fieldSet.add(path);
        }
      }
    }
    return Array.from(fieldSet);
  }

  getFilteredFields(query: string): string[] {
    const all = this.getAvailableFields();
    const q = (query || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter(field => field.toLowerCase().includes(q));
  }

  syncEntriesFromAdjustments(): void {
    if (!this.adjustments || typeof this.adjustments !== 'object') {
      this.adjustments = {};
    }
    this.entries = Object.entries(this.adjustments).map(([key, val]) => {
      const valueType = this.detectValueType(key, val);
      const isArrayAttack = valueType === 'attack' && Array.isArray(val);
      return {
        key,
        valueType,
        value: this.normalizeValueForType(valueType, val, isArrayAttack),
        isArrayAttack,
      };
    });
  }

  detectValueType(key: string, val: any): AdjustmentValueType {
    if (typeof val === 'number') return 'number';
    if (typeof val === 'string') return 'string';
    if (val && typeof val === 'object') {
      if (
        key === 'spells' ||
        key === 'spellLikeAbilities' ||
        key.startsWith('spells.') ||
        key.startsWith('spellLikeAbilities.')
      ) {
        return 'spellCasting';
      }
      if (key === 'melee' || key === 'ranged') {
        return 'attack';
      }
      if (Array.isArray(val)) {
        if (val.length > 0 && ('damage' in val[0] || 'toHitAbility' in val[0] || 'crit' in val[0])) {
          return 'attack';
        }
      }
      if ('damage' in val && ('toHitAbility' in val || 'crit' in val)) {
        return 'attack';
      }
      const keys = Object.keys(val);
      if ('value' in val && keys.every(k => k === 'value' || k === 'type')) {
        return 'typed';
      }
      if (
        'adjustments' in val ||
        'description' in val ||
        'charges' in val ||
        'active' in val ||
        ['specialAttack', 'defensiveAbilities', 'specialQuality', 'feats', 'conditions', 'race.features'].includes(key)
      ) {
        return 'feature';
      }
      // Check if it looks like a SpellCasting map
      const firstChild = Object.values(val)[0] as any;
      if (firstChild && typeof firstChild === 'object' && ('casterLevel' in firstChild || 'spells' in firstChild)) {
        return 'spellCasting';
      }
    }
    return 'number';
  }

  private inferDefaultTypeForKey(key: string): AdjustmentValueType {
    if (key === 'spells' || key === 'spellLikeAbilities' || key.startsWith('spells.') || key.startsWith('spellLikeAbilities.')) {
      return 'spellCasting';
    }
    if (key === 'melee' || key === 'ranged') {
      return 'attack';
    }
    if (['specialAttack', 'defensiveAbilities', 'specialQuality', 'feats', 'conditions', 'race.features'].includes(key)) {
      return 'feature';
    }
    if (['senses', 'immune', 'languages', 'alignment', 'description', 'name', 'saves.conditional'].includes(key)) {
      return 'string';
    }
    return 'number';
  }

  private normalizeValueForType(type: AdjustmentValueType, currentVal: any, isArrayAttack = false): any {
    switch (type) {
      case 'number':
        return typeof currentVal === 'number' ? currentVal : Number(currentVal) || 0;
      case 'string':
        return typeof currentVal === 'string' ? currentVal : String(currentVal ?? '');
      case 'typed':
        if (currentVal && typeof currentVal === 'object' && 'value' in currentVal) {
          return { type: currentVal.type ?? '', value: currentVal.value ?? 0 };
        }
        return { type: '', value: typeof currentVal === 'number' || typeof currentVal === 'string' ? currentVal : 0 };
      case 'feature':
        if (currentVal && typeof currentVal === 'object' && ('adjustments' in currentVal || 'name' in currentVal || 'description' in currentVal)) {
          if (!currentVal.adjustments) currentVal.adjustments = {};
          return currentVal;
        }
        return new Feature({ name: 'New Feature', description: '', adjustments: {} });
      case 'attack':
        if (Array.isArray(currentVal)) {
          return currentVal.length > 0 ? currentVal : [new Attack()];
        }
        if (currentVal && typeof currentVal === 'object' && ('damage' in currentVal || 'toHitAbility' in currentVal)) {
          return isArrayAttack ? [currentVal] : currentVal;
        }
        return isArrayAttack ? [new Attack()] : new Attack();
      case 'spellCasting':
        if (currentVal && typeof currentVal === 'object' && Object.keys(currentVal).length > 0 && !('value' in currentVal)) {
          return currentVal;
        }
        return { default: createEmptyCaster('default') };
    }
  }

  addAdjustment(): void {
    this.entries.push({
      key: '',
      valueType: 'number',
      value: 0,
    });
    this.syncToAdjustments();
  }

  removeAdjustment(index: number): void {
    this.entries.splice(index, 1);
    if (this.openDropdownIndex === index) {
      this.openDropdownIndex = null;
      this.highlightedIndex = -1;
    }
    this.syncToAdjustments();
  }

  openDropdown(index: number): void {
    this.openDropdownIndex = index;
    this.highlightedIndex = 0;
  }

  toggleDropdown(index: number): void {
    if (this.openDropdownIndex === index) {
      this.openDropdownIndex = null;
      this.highlightedIndex = -1;
    } else {
      this.openDropdownIndex = index;
      this.highlightedIndex = 0;
    }
  }

  closeDropdown(): void {
    this.openDropdownIndex = null;
    this.highlightedIndex = -1;
  }

  onKeyInputChange(index: number, newKey: string): void {
    this.entries[index].key = newKey;
    this.openDropdownIndex = index;
    this.highlightedIndex = 0;
    this.syncToAdjustments();
  }

  onKeyInputKeydown(index: number, event: KeyboardEvent): void {
    const filtered = this.getFilteredFields(this.entries[index].key);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.openDropdownIndex !== index) {
        this.openDropdownIndex = index;
        this.highlightedIndex = 0;
      } else if (filtered.length > 0) {
        this.highlightedIndex = (this.highlightedIndex + 1) % filtered.length;
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.openDropdownIndex !== index) {
        this.openDropdownIndex = index;
        this.highlightedIndex = Math.max(0, filtered.length - 1);
      } else if (filtered.length > 0) {
        this.highlightedIndex = this.highlightedIndex <= 0 ? filtered.length - 1 : this.highlightedIndex - 1;
      }
    } else if (event.key === 'Enter') {
      if (this.openDropdownIndex === index && filtered.length > 0) {
        event.preventDefault();
        const targetIdx = this.highlightedIndex >= 0 && this.highlightedIndex < filtered.length ? this.highlightedIndex : 0;
        this.selectField(index, filtered[targetIdx]);
      }
    } else if (event.key === 'Escape') {
      this.closeDropdown();
    }
  }

  selectField(index: number, field: string): void {
    const entry = this.entries[index];
    const wasDefaultNumberZero = entry.valueType === 'number' && (entry.value === 0 || entry.value === '');
    entry.key = field;
    if (wasDefaultNumberZero) {
      const inferred = this.inferDefaultTypeForKey(field);
      if (inferred !== entry.valueType) {
        entry.valueType = inferred;
        entry.value = this.normalizeValueForType(inferred, undefined);
      }
    }
    this.closeDropdown();
    this.syncToAdjustments();
  }

  onValueTypeChange(index: number, newType: AdjustmentValueType): void {
    const entry = this.entries[index];
    entry.valueType = newType;
    entry.value = this.normalizeValueForType(newType, entry.value, entry.isArrayAttack);
    this.syncToAdjustments();
  }

  onTypedValueInputChange(entry: AdjustmentEntry, rawVal: string): void {
    const trimmed = String(rawVal ?? '').trim();
    if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      entry.value.value = Number(trimmed);
    } else {
      entry.value.value = rawVal;
    }
    this.syncToAdjustments();
  }

  getAttackList(entry: AdjustmentEntry): Attack[] {
    if (Array.isArray(entry.value)) return entry.value;
    return [entry.value];
  }

  toggleDamageType(attack: Attack, dt: damageType, checked: boolean): void {
    if (!Array.isArray(attack.damageType)) attack.damageType = [];
    if (checked && !attack.damageType.includes(dt)) {
      attack.damageType.push(dt);
    } else if (!checked) {
      attack.damageType = attack.damageType.filter(t => t !== dt);
    }
    this.syncToAdjustments();
  }

  syncToAdjustments(): void {
    if (!this.adjustments || typeof this.adjustments !== 'object') {
      this.adjustments = {};
    }
    for (const k of Object.keys(this.adjustments)) {
      delete this.adjustments[k];
    }
    for (const entry of this.entries) {
      const k = (entry.key || '').trim();
      if (k) {
        this.adjustments[k] = entry.value;
      }
    }
    this.adjustmentsChange.emit(this.adjustments);
  }
}
