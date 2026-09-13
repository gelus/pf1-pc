import {KeyValuePipe} from '@angular/common';
import {Component, Input} from '@angular/core';
import {ApplyCharacterService, SpellCastingType} from '../apply-character.service';
import {CasterType, Spell} from '../interfaces/character.interface';
import {SpellModalComponent} from '../spell-modal/spell-modal.component';
import {StatDisplayComponent} from '../stat-display/stat-display.component';

@Component({
  selector: 'app-spell-casting-list',
  imports: [KeyValuePipe, SpellModalComponent, StatDisplayComponent],
  templateUrl: './spell-casting-list.component.html',
  styleUrl: './spell-casting-list.component.sass',
})
export class SpellCastingListComponent {
  @Input({required: true}) type!: SpellCastingType;
  @Input({required: true}) label = '';

  constructor(public character: ApplyCharacterService) {}

  openSpell(
    modal: SpellModalComponent,
    origin: string,
    levelIndex: number,
    caster: CasterType,
    spell: Spell,
  ): void {
    modal.openSpell(this.type, origin, levelIndex, caster, spell);
  }
}
