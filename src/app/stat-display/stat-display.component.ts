import { Component, HostListener, Input, computed, input } from '@angular/core';
import {CommonModule} from '@angular/common';
import {getByPath} from '../utils/object.util';
import {AbilityModPipe} from '../ability-mod.pipe';
import {ApplyCharacterService} from '../apply-character.service';

@Component({
  selector: 'stat',
  imports: [
    CommonModule,
    AbilityModPipe,
  ],
  templateUrl: './stat-display.component.html',
  styleUrl: './stat-display.component.sass'
})
export class StatDisplayComponent {

  constructor(public character: ApplyCharacterService) {}

  @Input() additionalTooltips: String[][] = [];


  hovered = false;
  @HostListener('mouseenter') mouseIn() { this.hovered = true; }
  @HostListener('mouseleave') mouseOut() { this.hovered = false; }

  stat = input.required<string>();
  ability = input<string>();
  maxAbilityBonus = input<number>(0);

  displayStat = computed(() => {
    const char = this.character.applied();
    const stat = this.stat();
    const ability = this.ability();
    const maxAbilityBonus = this.maxAbilityBonus();
    let displayStat = 0;

    if (char && stat) {
      let s = getByPath(char, stat) ?? 0;
      displayStat = s?.value ?? s;
    }

    if (ability && char?.abilityScores) displayStat += AbilityModPipe.algorithm(char.abilityScores[ability], maxAbilityBonus || Infinity);

    return displayStat;
  });
}
