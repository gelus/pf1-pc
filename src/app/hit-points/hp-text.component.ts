import {Component, computed, input} from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {hpSummaryOf} from './hit-points';

// a character's hit points as a button: "HP 16/24 +5 -3", red while below the max. it is the button, so the place it
// is in decides what a click does (the sheet opens the hit points dialog)
@Component({
  selector: 'button[appHpText]',
  template: `<span class="pf-label">HP</span>{{' '}}<b class="hp-button__current">{{applied().currentHp}}</b><span class="hp-button__max">/{{applied().hp}}</span>@if (applied().tempHp) { <span class="hp-button__temp">+{{applied().tempHp}}</span> }@if (applied().nonlethalDamage) { <span class="hp-button__nonleathal">-{{applied().nonlethalDamage}}</span> }`,
  styleUrl: './hp-text.component.sass',
  host: {
    'type': 'button', 'class': 'hp-button', '[class.down]': 'applied().currentHp < applied().hp',
    '[attr.aria-label]': '"Hit points: " + summary()', '[title]': '"Hit points: " + summary()',
  },
})
export class HpTextComponent {
  character = input.required<ApplyCharacterService>();
  applied = computed(() => this.character().applied());
  summary = computed(() => hpSummaryOf(this.character().raw(), this.applied()));
}
