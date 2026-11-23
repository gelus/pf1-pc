import {metamagicName} from '../rules/metamagic';
import {KeyValuePipe} from '@angular/common';
import {Component, Input} from '@angular/core';
import {ApplyCharacterService, CastResult, SpellCastingType} from '../apply-character.service';
import {CasterType, PreparedSpell, Spell, SpellLevel} from '../interfaces/character.interface';
import {SpellModalComponent} from '../spell-modal/spell-modal.component';
import {StatDisplayComponent} from '../stat-display/stat-display.component';
import {hasSavingThrow, spellFailureChanceFor} from '../rules/spellcasting';

@Component({
  selector: 'app-spell-casting-list',
  imports: [KeyValuePipe, SpellModalComponent, StatDisplayComponent],
  templateUrl: './spell-casting-list.component.html',
  styleUrl: './spell-casting-list.component.sass',
})
export class SpellCastingListComponent {
  @Input({required: true}) type!: SpellCastingType;
  @Input({required: true}) label = '';

  readonly hasSavingThrow = hasSavingThrow;

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

  isPrepared(caster: CasterType): boolean {
    return this.type === 'spells' && caster.casting === 'prepared';
  }

  // a level the casting ability is too low for
  tooHigh(caster: CasterType, levelIndex: number): boolean {
    return this.type === 'spells' && caster.maxSpellLevel !== undefined && levelIndex > caster.maxSpellLevel;
  }

  abilityLabel(caster: CasterType): string {
    const ability = caster.ability || '';
    return ability.charAt(0).toUpperCase() + ability.slice(1);
  }

  abilityScore(caster: CasterType): number {
    return this.character.applied().abilityScores?.[caster.ability] ?? 10;
  }

  // what the slots of a class caster's level are made of
  slotsTitle(level: SpellLevel): string {
    if (level.base === undefined) return 'uses per day';
    const extra = level.perDay.total - level.base - (level.bonus || 0);
    return [`${level.base} base`, `${level.bonus || 0} bonus`, ...(extra ? [`${extra} from features`] : [])].join(' + ');
  }

  spellFor(level: SpellLevel, prepared: PreparedSpell): Spell | undefined {
    return level.spells.find(({name}) => name.toLowerCase() === prepared.name.toLowerCase());
  }
  // a prepared spell with metamagic is on the list of its own level, below its slot's
  preparedSpell(caster: CasterType, levelIndex: number, prepared: PreparedSpell): Spell | undefined {
    return this.spellFor(caster.spells[prepared.level ?? levelIndex] ?? caster.spells[levelIndex], prepared);
  }
  readonly metamagicName = metamagicName;

  // a prepared spell opens like any other, casting it from there casts that prepared instance
  openPrepared(modal: SpellModalComponent, origin: string, levelIndex: number, caster: CasterType, preparedIndex: number): void {
    const prepared = caster.spells[levelIndex]?.prepared?.[preparedIndex];
    const spell = prepared && this.preparedSpell(caster, levelIndex, prepared);
    if (!spell) return;
    modal.openSpell(this.type, origin, levelIndex, caster, spell, preparedIndex);
  }

  lastCastFor(origin: string): CastResult | undefined {
    const last = this.character.lastCast();
    return last && last.origin === origin && this.type === 'spells' ? last : undefined;
  }

  spellFailure(caster: CasterType, spell: Spell): number {
    return this.type === 'spells' ? spellFailureChanceFor(this.character.applied(), caster, spell) : 0;
  }

  setChoice(origin: string, choice: 'domains' | 'oppositionSchools' | 'school', event: Event): void {
    this.character.setCasterChoice(origin, choice, (event.target as HTMLInputElement).value);
  }
}
