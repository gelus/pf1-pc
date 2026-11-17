import { CommonModule } from '@angular/common';
import { Component, HostBinding } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApplyCharacterService, SpellCastingType } from '../apply-character.service';
import { CasterType, Charges, Spell, SpellLevel } from '../interfaces/character.interface';
import { fitsExtraSlot, hasSavingThrow, spellDc, spellFailureChanceFor } from '../rules/spellcasting';
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
  // why the spell could not be prepared, if it could not
  prepareError = '';
  // the prepared instance the spell was opened from, casting casts that one (its slot, domain or school included)
  preparedIndex?: number;

  constructor(public character: ApplyCharacterService) {}

  spellLevelExists(): boolean {
    return !!this.character.applied()[this.type][this.origin]?.spells?.[this.levelIndex];
  }

  // the applied caster and level of the spell, what the rules worked out for it
  appliedCaster(): CasterType | undefined {
    return this.character.applied()[this.type][this.origin];
  }

  appliedLevel(): SpellLevel | undefined {
    return this.appliedCaster()?.spells?.[this.levelIndex];
  }

  isPrepared(): boolean {
    return this.type === 'spells' && this.appliedCaster()?.casting === 'prepared';
  }

  dc(): number | undefined {
    const caster = this.appliedCaster();
    if (!caster?.ability || !hasSavingThrow(this.spell)) return undefined;
    return spellDc(this.character.applied(), caster, this.levelIndex, this.spell);
  }

  spellFailure(): number {
    const caster = this.appliedCaster();
    return caster && this.type === 'spells' ? spellFailureChanceFor(this.character.applied(), caster, this.spell) : 0;
  }

  // the uncast prepared instances of the spell
  preparedCount(): number {
    const name = this.spell.name.toLowerCase();
    return (this.appliedLevel()?.prepared || []).filter(p => p.name.toLowerCase() === name && !p.cast).length;
  }

  canPrepareExtra(): boolean {
    const caster = this.appliedCaster();
    return !!caster && !!this.appliedLevel()?.extraSlot && fitsExtraSlot(caster, this.spell);
  }

  prepare(slot: 'regular' | 'extra' = 'regular'): void {
    this.prepareError = this.character.prepareSpell(this.origin, this.levelIndex, this.spell.name, slot) || '';
  }

  hasAdjustments(): boolean {
    return !!this.spell?.adjustments && Object.keys(this.spell.adjustments).some(k => k.trim() !== '');
  }

  openSpell(
    type: SpellCastingType, origin: string, levelIndex: number, caster: CasterType, spell: Spell, preparedIndex?: number,
  ): void {
    this.preparedIndex = preparedIndex;
    this.type = type;
    this.origin = origin;
    this.levelIndex = levelIndex;
    this.caster = { ...caster };
    this.spell = JSON.parse(JSON.stringify(spell));
    delete this.spell.dc;
    this.original = { origin, levelIndex, name: spell.name };
    this.prepareError = '';
    this.perDay = caster?.spells?.[levelIndex]?.perDay
      ? { ...caster.spells[levelIndex].perDay }
      : { current: 0, total: 0 };
    this.editing = true;
    this.open = true;
  }

  openNew(type: SpellCastingType, origin = '', levelIndex = 0, caster?: CasterType): void {
    this.preparedIndex = undefined;
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
    this.prepareError = '';
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
    // the dc is worked out by the rules, it is not saved with the spell
    delete this.spell.dc;
    if (!this.spell.domain?.trim()) delete this.spell.domain;
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

  // the prepared instance the spell was opened from, while it is still there
  openedPrepared() {
    if (this.preparedIndex === undefined) return undefined;
    const prepared = this.appliedLevel()?.prepared?.[this.preparedIndex];
    return prepared && prepared.name.toLowerCase() === this.spell.name.toLowerCase() ? prepared : undefined;
  }

  cast(onSelf = false): void {
    // the sheet shows what came of it (its spell failure roll), see ApplyCharacterService.lastCast
    // opened from a prepared instance, that instance is cast, otherwise any uncast one of the spell
    const preparedIndex = this.openedPrepared() ? this.preparedIndex : undefined;
    this.character.cast(this.type, this.origin, this.levelIndex, this.spell, { onSelf, preparedIndex });
    this.closeModal();
  }

  closeModal(): void {
    this.open = false;
    this.preparedIndex = undefined;
    this.original = undefined;
    this.spell = createEmptySpell();
  }
}
