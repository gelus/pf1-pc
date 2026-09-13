import {CommonModule} from '@angular/common';
import {Component, HostBinding} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApplyCharacterService, SpellCastingType} from '../apply-character.service';
import {Adjustments, CasterType, Charges, Spell} from '../interfaces/character.interface';

const emptySpell = (): Spell => ({
  name: '',
  school: '',
  castingTime: '',
  components: [],
  range: '',
  target: '',
  duration: '',
  savingThrow: '',
  spellResistance: false,
  description: '',
});

@Component({
  selector: 'app-spell-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './spell-modal.component.html',
  styleUrl: './spell-modal.component.sass',
})
export class SpellModalComponent {
  @HostBinding('class.open') open = false;

  editing = false;
  type: SpellCastingType = 'spells';
  origin = '';
  levelIndex = 0;
  caster: Partial<CasterType> = {};
  spell: Spell = emptySpell();
  original?: {origin: string, levelIndex: number, name: string};
  components = '';
  descriptors = '';
  adjustments = '';
  perDay: Charges = {current: 0, total: 0};

  constructor(public character: ApplyCharacterService) {}

  spellLevelExists(): boolean {
    return !!this.character.applied()[this.type][this.origin]?.spells?.[this.levelIndex];
  }

  openSpell(type: SpellCastingType, origin: string, levelIndex: number, caster: CasterType, spell: Spell): void {
    this.type = type;
    this.origin = origin;
    this.levelIndex = levelIndex;
    this.caster = {...caster};
    this.spell = JSON.parse(JSON.stringify(spell));
    this.original = {origin, levelIndex, name: spell.name};
    this.perDay = {...caster.spells[levelIndex].perDay};
    this.prepareEditorValues();
    this.editing = false;
    this.open = true;
  }

  openNew(type: SpellCastingType, origin = '', levelIndex = 0, caster?: CasterType): void {
    this.type = type;
    this.origin = origin;
    this.levelIndex = levelIndex;
    this.caster = caster ? {...caster} : {
      name: origin,
      ability: '',
      casterLevel: 1,
      concentration: 1,
    };
    this.spell = emptySpell();
    this.original = undefined;
    this.perDay = caster?.spells[levelIndex]
      ? {...caster.spells[levelIndex].perDay}
      : {current: 0, total: 0};
    this.prepareEditorValues();
    this.editing = true;
    this.open = true;
  }

  private prepareEditorValues(): void {
    this.components = this.spell.components.join(', ');
    this.descriptors = this.spell.descriptors?.join(', ') ?? '';
    this.adjustments = this.spell.adjustments ? JSON.stringify(this.spell.adjustments, null, 2) : '';
  }

  save(): void {
    if (!this.origin.trim() || !this.spell.name.trim()) return;
    this.origin = this.origin.trim();
    this.levelIndex = Math.max(0, Number(this.levelIndex) || 0);
    this.spell.components = this.toList(this.components);
    const descriptors = this.toList(this.descriptors);
    this.spell.descriptors = descriptors.length ? descriptors : undefined;
    this.spell.adjustments = this.parseAdjustments();
    this.perDay.total = Math.max(0, Number(this.perDay.total) || 0);
    this.perDay.current = Math.min(this.perDay.total, Math.max(0, Number(this.perDay.current) || 0));
    this.character.saveSpell(
      this.type,
      this.origin,
      this.levelIndex,
      this.spell,
      this.caster,
      this.original,
      {perDay: this.perDay},
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
    this.editing = false;
    this.original = undefined;
    this.spell = emptySpell();
  }

  private toList(value: string): string[] {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  private parseAdjustments(): Adjustments|undefined {
    if (!this.adjustments.trim()) return undefined;
    try {
      return JSON.parse(this.adjustments);
    } catch {
      return this.spell.adjustments;
    }
  }
}
