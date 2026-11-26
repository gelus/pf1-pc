import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Optional, Output, SimpleChanges, forwardRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApplyCharacterService } from '../apply-character.service';
import { AdjustmentMode, Adjustments, Feature, adjustmentModes } from '../interfaces/character.interface';
import { Attack, attackHands, damageType } from '../utils/attack.class';
import { Character } from '../utils/character.class';
import { SKILL_FAMILIES } from '../utils/skilllist.class';
import { FeatureBlockComponent, countLabel, featureSummary } from '../feature-block/feature-block.component';
import { SpellCastingEditorComponent, createEmptyCaster } from '../spell-casting-editor/spell-casting-editor.component';
import { migrateDamageReductionAdjustments } from '../rules/defenses';

// fields whose adjustments are usually not added, a new adjustment of them starts out with this mode
export const defaultModeForKey: {[key: string]: AdjustmentMode} = {
  maxDexBonus: 'min',
};

export const adjustmentModeLabels: {[mode in AdjustmentMode]: string} = {
  add: 'Add',
  set: 'Set (replace base)',
  min: 'Cap (at most)',
  max: 'Floor (at least)',
  raise: 'Raise the cap',
  lower: 'Lower (a resistance, DR or SR)',
};

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
  // the whole group shown as one line
  @Input() collapsed = false;
  // the nested entries (features, attacks, spells) shown as one line; when there are several they start out collapsed
  private collapsedEntries = new Set<AdjustmentEntry>();
  openDropdownIndex: number | null = null;
  highlightedIndex = -1;

  readonly damageTypes: damageType[] = ['B', 'P', 'S'];
  readonly attackHands = attackHands;
  readonly adjustmentModes = adjustmentModes;
  readonly adjustmentModeLabels = adjustmentModeLabels;

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
    // damage reduction is keyed by what overcomes it, any bypass can be typed after the dot
    fieldSet.add('damageReduction.-');
    fieldSet.add('damageReduction.magic');
    fieldSet.add('skills.*.value');
    for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
      fieldSet.add(`skills.@${ability}.value`);
    }
    for (const family of SKILL_FAMILIES) {
      fieldSet.add(`skills.${family}.subSkills.*.value`);
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
    // damage reduction saved as {value, bypass} is edited as the damageReduction.<bypass> adjustments it now is
    const migrated = migrateDamageReductionAdjustments(this.adjustments);
    if (migrated !== this.adjustments) {
      for (const k of Object.keys(this.adjustments)) delete this.adjustments[k];
      Object.assign(this.adjustments, migrated);
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
    const nested = this.entries.filter(entry => this.isNested(entry));
    this.collapsedEntries = new Set(nested.length > 1 ? nested : []);
  }

  isNested(entry: AdjustmentEntry): boolean {
    return entry.valueType === 'feature' || entry.valueType === 'attack' || entry.valueType === 'spellCasting';
  }

  isEntryCollapsed(entry: AdjustmentEntry): boolean {
    return this.isNested(entry) && this.collapsedEntries.has(entry);
  }

  toggleEntry(entry: AdjustmentEntry): void {
    if (!this.collapsedEntries.delete(entry)) this.collapsedEntries.add(entry);
  }

  get groupSummary(): string {
    const keys = this.entries.map(entry => (entry.key || '').trim()).filter(Boolean);
    const shown = keys.slice(0, 3).join(', ') + (keys.length > 3 ? ', …' : '');
    return countLabel(this.entries.length, 'adjustment') + (shown ? `: ${shown}` : '');
  }

  // a one line summary of a nested entry, for when it is collapsed
  entrySummary(entry: AdjustmentEntry): string {
    const key = (entry.key || '').trim() || 'unnamed';
    switch (entry.valueType) {
      case 'feature':
        return `${key}: ${entry.value?.name || 'Unnamed feature'} · ${featureSummary(entry.value)}`;
      case 'attack': {
        const attacks = this.getAttackList(entry);
        const names = attacks.map(attack => attack?.name).filter(Boolean).join(', ');
        return `${key}: ${countLabel(attacks.length, 'attack')}${names ? ` (${names})` : ''}`;
      }
      case 'spellCasting':
        return `${key}: ${countLabel(Object.keys(entry.value || {}).length, 'caster')}`;
      default:
        return key;
    }
  }

  detectValueType(key: string, val: any): AdjustmentValueType {
    if (typeof val === 'number') return 'number';
    if (typeof val === 'string') return 'string';
    // a list of names (immunities, ...) is edited as text, separated by commas
    if (Array.isArray(val) && val.every(v => typeof v === 'string')) return 'string';
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
      if ('value' in val && keys.every(k => k === 'value' || k === 'type' || k === 'mode' || k === 'if' || k === 'unless')) {
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
    if (defaultModeForKey[key]) {
      return 'typed';
    }
    if (['senses', 'immune', 'immunities', 'languages', 'alignment', 'description', 'name', 'saves.conditional'].includes(key)) {
      return 'string';
    }
    return 'number';
  }

  private normalizeValueForType(type: AdjustmentValueType, currentVal: any, isArrayAttack = false): any {
    switch (type) {
      case 'number':
        return typeof currentVal === 'number' ? currentVal : Number(currentVal) || 0;
      case 'string':
        if (Array.isArray(currentVal)) return currentVal.join(', ');
        return typeof currentVal === 'string' ? currentVal : String(currentVal ?? '');
      case 'typed':
        if (currentVal && typeof currentVal === 'object' && 'value' in currentVal) {
          return {
            ...(currentVal.type !== undefined ? { type: currentVal.type } : { type: '' }),
            value: currentVal.value ?? 0,
            ...(currentVal.if !== undefined ? { if: currentVal.if } : {}),
            ...(currentVal.unless !== undefined ? { unless: currentVal.unless } : {}),
            ...(currentVal.mode !== undefined && currentVal.mode !== 'add' ? { mode: currentVal.mode } : {}),
          };
        }
        return { type: '', value: typeof currentVal === 'number' || typeof currentVal === 'string' || typeof currentVal === 'boolean' ? currentVal : 0 };
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
      const defaultMode = defaultModeForKey[field];
      if (defaultMode && entry.valueType === 'typed') this.setMode(entry.value, defaultMode);
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

  modeOf(entry: AdjustmentEntry): AdjustmentMode {
    return entry.value?.mode || 'add';
  }

  onModeChange(entry: AdjustmentEntry, mode: AdjustmentMode): void {
    this.setMode(entry.value, mode);
    this.syncToAdjustments();
  }

  // adding is the default, an adjustment that adds carries no mode
  private setMode(value: any, mode: AdjustmentMode): void {
    if (!value || typeof value !== 'object') return;
    if (mode === 'add') delete value.mode;
    else value.mode = mode;
  }

  onTypedValueInputChange(entry: AdjustmentEntry, rawVal: string): void {
    const trimmed = String(rawVal ?? '').trim();
    if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      entry.value.value = Number(trimmed);
    } else if (trimmed === 'true') {
      entry.value.value = true;
    } else if (trimmed === 'false') {
      entry.value.value = false;
    } else {
      entry.value.value = rawVal;
    }
    this.syncToAdjustments();
  }

  // the items of the character a ranged attack can take as its ammunition
  inventoryItems(): {id: string, name: string, quantity: number}[] {
    return this.characterService?.raw?.()?.inventory || [];
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
