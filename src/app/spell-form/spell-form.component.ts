import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, forwardRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Adjustments, Spell } from '../interfaces/character.interface';
import { AdjustmentBlockComponent } from '../adjustment-block/adjustment-block.component';

export const createEmptySpell = (): Spell => ({
  name: '',
  school: '',
  subSchool: '',
  descriptors: [],
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
  selector: 'app-spell-form',
  imports: [CommonModule, FormsModule, forwardRef(() => AdjustmentBlockComponent)],
  templateUrl: './spell-form.component.html',
  styleUrl: './spell-form.component.sass',
})
export class SpellFormComponent implements OnInit, OnChanges {
  @Input() spell: Spell = createEmptySpell();
  @Output() spellChange = new EventEmitter<Spell>();

  componentsText = '';
  descriptorsText = '';
  spellAdjustments: Adjustments = {};

  ngOnInit(): void {
    this.syncFromSpell();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['spell']) {
      this.syncFromSpell();
    }
  }

  syncFromSpell(): void {
    if (!this.spell) {
      this.spell = createEmptySpell();
    }
    if (!Array.isArray(this.spell.components)) {
      this.spell.components = [];
    }
    this.componentsText = this.spell.components.join(', ');
    this.descriptorsText = (this.spell.descriptors ?? []).join(', ');
    this.spellAdjustments = this.spell.adjustments ?? {};
  }

  onComponentsChange(value: string): void {
    this.componentsText = value;
    this.spell.components = this.parseCommaList(value);
    this.emitChange();
  }

  onDescriptorsChange(value: string): void {
    this.descriptorsText = value;
    const list = this.parseCommaList(value);
    this.spell.descriptors = list.length ? list : undefined;
    this.emitChange();
  }

  onAdjustmentsChange(adjustments: Adjustments): void {
    this.spellAdjustments = adjustments;
    const hasKeys = adjustments && Object.keys(adjustments).some(k => k.trim() !== '');
    this.spell.adjustments = hasKeys ? adjustments : undefined;
    this.emitChange();
  }

  emitChange(): void {
    const hasKeys = this.spellAdjustments && Object.keys(this.spellAdjustments).some(k => k.trim() !== '');
    this.spell.adjustments = hasKeys ? this.spellAdjustments : undefined;
    this.spellChange.emit(this.spell);
  }

  private parseCommaList(value: string): string[] {
    return (value || '').split(',').map(item => item.trim()).filter(Boolean);
  }
}
