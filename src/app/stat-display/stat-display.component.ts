import { Component, HostListener, Input, computed, input } from '@angular/core';
import {CommonModule} from '@angular/common';
import {getByPath} from '../utils/object.util';
import {AbilityModPipe} from '../ability-mod.pipe';
import { EvaluateValuePipe } from '../evaluate-value.pipe';
import {ApplyCharacterService} from '../apply-character.service';

@Component({
  selector: 'stat',
  imports: [
    CommonModule,
    AbilityModPipe,
    EvaluateValuePipe,
  ],
  templateUrl: './stat-display.component.html',
  styleUrl: './stat-display.component.sass'
})
export class StatDisplayComponent {

  constructor(public character: ApplyCharacterService) {}

  @Input() debug?: boolean;
  @Input() additional: Array<[number, string]> = [];
  @Input() additionalTooltips: Array<[number|string, string]> = [];


  hovered = false;
  @HostListener('mouseenter') mouseIn() { this.hovered = true; }
  @HostListener('mouseleave') mouseOut() { this.hovered = false; }

  stat = input.required<string>();
  ability = input<string>();
  abilityArray = computed(() => {
    const ability = this.ability();
    return ability ? ability.split(', ') : [];
  } )
  maxAbilityBonus = input<number>(0);

  displayStat = computed(() => {
    const char = this.character.applied();
    const stat = this.stat();
    const abilityAr = this.abilityArray();
    const maxAbilityBonus = this.maxAbilityBonus();
    let displayStat = 0;


    if (char && stat) {
      let s = getByPath(char, stat) ?? 0;
      displayStat = s?.value ?? s;
    }

    if (abilityAr && char?.abilityScores) {
      for(let ab of abilityAr) {
        if (char?.abilityScores[ab]) displayStat += AbilityModPipe.algorithm(char.abilityScores[ab], maxAbilityBonus || Infinity);
      }
    }
    for (let x of this.additional) displayStat += x[0];

    return displayStat || '0';
  });
}
