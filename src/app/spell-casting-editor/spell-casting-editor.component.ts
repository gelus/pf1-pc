import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, forwardRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CasterType, Spell, SpellCasting, SpellLevel } from '../interfaces/character.interface';
import { SpellFormComponent, createEmptySpell } from '../spell-form/spell-form.component';

export interface CasterEntry {
  origin: string;
  caster: CasterType;
}

export const createEmptySpellLevel = (): SpellLevel => ({
  perDay: { current: 1, total: 1, label: 'per day' },
  spells: [],
});

export const createEmptyCaster = (origin = 'default'): CasterType => ({
  name: origin,
  ability: 'int',
  casterLevel: 1,
  concentration: 1,
  spells: [createEmptySpellLevel()],
});

@Component({
  selector: 'app-spell-casting-editor',
  imports: [CommonModule, FormsModule, forwardRef(() => SpellFormComponent)],
  templateUrl: './spell-casting-editor.component.html',
  styleUrl: './spell-casting-editor.component.sass',
})
export class SpellCastingEditorComponent implements OnInit, OnChanges {
  @Input() spellCasting: SpellCasting | CasterType | any = {};
  @Output() spellCastingChange = new EventEmitter<any>();

  casterEntries: CasterEntry[] = [];
  isDirectCaster = false;

  ngOnInit(): void {
    this.syncFromInput();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['spellCasting']) {
      this.syncFromInput();
    }
  }

  syncFromInput(): void {
    if (!this.spellCasting || typeof this.spellCasting !== 'object') {
      this.spellCasting = { default: createEmptyCaster('default') };
    }

    if ('casterLevel' in this.spellCasting && Array.isArray(this.spellCasting.spells)) {
      this.isDirectCaster = true;
      this.casterEntries = [{ origin: this.spellCasting.name || 'caster', caster: this.spellCasting }];
    } else {
      this.isDirectCaster = false;
      this.casterEntries = Object.entries(this.spellCasting as SpellCasting).map(([origin, caster]) => ({
        origin,
        caster: {
          name: caster?.name ?? origin,
          ability: caster?.ability ?? 'int',
          casterLevel: caster?.casterLevel ?? 1,
          concentration: caster?.concentration ?? 1,
          spells: Array.isArray(caster?.spells) ? caster.spells : [],
        },
      }));
    }
  }

  addCaster(): void {
    const newOrigin = `caster_${this.casterEntries.length + 1}`;
    this.casterEntries.push({
      origin: newOrigin,
      caster: createEmptyCaster(newOrigin),
    });
    this.emitChange();
  }

  removeCaster(index: number): void {
    this.casterEntries.splice(index, 1);
    this.emitChange();
  }

  addSpellLevel(caster: CasterType): void {
    if (!Array.isArray(caster.spells)) caster.spells = [];
    caster.spells.push(createEmptySpellLevel());
    this.emitChange();
  }

  removeSpellLevel(caster: CasterType, levelIndex: number): void {
    caster.spells.splice(levelIndex, 1);
    this.emitChange();
  }

  addSpell(spellLevel: SpellLevel): void {
    if (!Array.isArray(spellLevel.spells)) spellLevel.spells = [];
    spellLevel.spells.push(createEmptySpell());
    this.emitChange();
  }

  removeSpell(spellLevel: SpellLevel, spellIndex: number): void {
    spellLevel.spells.splice(spellIndex, 1);
    this.emitChange();
  }

  onSpellChange(spellLevel: SpellLevel, spellIndex: number, updatedSpell: Spell): void {
    spellLevel.spells[spellIndex] = updatedSpell;
    this.emitChange();
  }

  emitChange(): void {
    if (this.isDirectCaster && this.casterEntries.length > 0) {
      Object.assign(this.spellCasting, this.casterEntries[0].caster);
      this.spellCastingChange.emit(this.spellCasting);
      return;
    }

    const result: SpellCasting = {};
    for (const entry of this.casterEntries) {
      const key = (entry.origin || entry.caster.name || 'default').trim();
      if (key) {
        result[key] = entry.caster;
      }
    }

    if (this.spellCasting && typeof this.spellCasting === 'object' && !Array.isArray(this.spellCasting)) {
      for (const existingKey of Object.keys(this.spellCasting)) {
        delete this.spellCasting[existingKey];
      }
      Object.assign(this.spellCasting, result);
      this.spellCastingChange.emit(this.spellCasting);
    } else {
      this.spellCasting = result;
      this.spellCastingChange.emit(result);
    }
  }
}
