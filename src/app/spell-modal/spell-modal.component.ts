import { CommonModule } from '@angular/common';
import { Component, HostBinding } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApplyCharacterService, SpellCastingType } from '../apply-character.service';
import { CasterType, Charges, Spell } from '../interfaces/character.interface';
import { SpellFormComponent, createEmptySpell } from '../spell-form/spell-form.component';

@Component({
  selector: 'app-spell-modal',
  imports: [CommonModule, FormsModule, SpellFormComponent],
  templateUrl: './spell-modal.component.html',
  styleUrl: './spell-modal.component.sass',
})
export class SpellModalComponent {
  @HostBinding('class.open') open = false;

  editing = true;
  type: SpellCastingType = 'spells';
  origin = '';
  levelIndex = 0;
  caster: Partial<CasterType> = {};
  spell: Spell = createEmptySpell();
  original?: { origin: string; levelIndex: number; name: string };
  perDay: Charges = { current: 0, total: 0 };

  constructor(public character: ApplyCharacterService) {}

  spellLevelExists(): boolean {
    return !!this.character.applied()[this.type][this.origin]?.spells?.[this.levelIndex];
  }

  hasAdjustments(): boolean {
    return !!this.spell?.adjustments && Object.keys(this.spell.adjustments).some(k => k.trim() !== '');
  }

  openSpell(type: SpellCastingType, origin: string, levelIndex: number, caster: CasterType, spell: Spell): void {
    this.type = type;
    this.origin = origin;
    this.levelIndex = levelIndex;
    this.caster = { ...caster };
    this.spell = JSON.parse(JSON.stringify(spell));
    this.original = { origin, levelIndex, name: spell.name };
    this.perDay = caster?.spells?.[levelIndex]?.perDay
      ? { ...caster.spells[levelIndex].perDay }
      : { current: 0, total: 0 };
    this.editing = true;
    this.open = true;
  }

  openNew(type: SpellCastingType, origin = '', levelIndex = 0, caster?: CasterType): void {
    this.type = type;
    this.origin = origin;
    this.levelIndex = levelIndex;
    this.caster = caster
      ? { ...caster }
      : {
          name: origin,
          ability: '',
          casterLevel: 1,
          concentration: 1,
        };
    this.spell = createEmptySpell();
    this.original = undefined;
    this.perDay = caster?.spells?.[levelIndex]
      ? { ...caster.spells[levelIndex].perDay }
      : { current: 0, total: 0 };
    this.editing = true;
    this.open = true;
  }

  save(): void {
    if (!this.origin.trim() || !this.spell.name.trim()) return;
    this.origin = this.origin.trim();
    this.levelIndex = Math.max(0, Number(this.levelIndex) || 0);
    if (!this.hasAdjustments()) {
      this.spell.adjustments = undefined;
    }
    this.perDay.total = Math.max(0, Number(this.perDay.total) || 0);
    this.perDay.current = Math.min(this.perDay.total, Math.max(0, Number(this.perDay.current) || 0));
    this.character.saveSpell(
      this.type,
      this.origin,
      this.levelIndex,
      this.spell,
      this.caster,
      this.original,
      { perDay: this.perDay }
    );
    this.closeModal();
  }

  delete(): void {
    if (this.original) {
      this.character.deleteSpell(this.type, this.original.origin, this.original.levelIndex, this.original.name);
    }
    this.closeModal();
  }

  cast(onSelf = false): void {
    this.character.castSpell(this.type, this.origin, this.levelIndex, this.spell, onSelf);
    this.closeModal();
  }

  closeModal(): void {
    this.open = false;
    this.original = undefined;
    this.spell = createEmptySpell();
  }
}
