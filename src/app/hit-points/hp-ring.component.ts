import {Component, computed, input} from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {hpBarParts, hpSummaryOf} from './hit-points';

// the health bar of a character drawn as a ring around what it holds (the side bar's picture of a character): the
// current hp clockwise from the top in the brand's colors, the nonlethal damage over their end, the temporary hp over
// them from the top. the same parts as the straight bar (hpBarParts), each arc a share of a path 100 long
@Component({
  selector: 'app-hp-ring',
  template: `
    <svg class="hp-ring__svg" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style="stop-color: var(--brand-deep)" />
          <stop offset="0.45" style="stop-color: var(--brand)" />
          <stop offset="1" style="stop-color: var(--brand-bright)" />
        </linearGradient>
      </defs>
      <circle class="hp-ring__track" cx="20" cy="20" r="18" pathLength="100" />
      <circle class="hp-ring__current" cx="20" cy="20" r="18" pathLength="100" [attr.stroke]="'url(#' + gradientId + ')'"
              [attr.stroke-dasharray]="arc(parts().current)" />
      <circle class="hp-ring__nonlethal" cx="20" cy="20" r="18" pathLength="100"
              [attr.stroke-dasharray]="arc(parts().nonlethal)" [attr.stroke-dashoffset]="-parts().nonlethalFrom" />
      <circle class="hp-ring__temp" cx="20" cy="20" r="18" pathLength="100" [attr.stroke-dasharray]="arc(parts().temp)" />
    </svg>
    <ng-content></ng-content>`,
  styleUrl: './hp-ring.component.sass',
  host: {'class': 'hp-ring', 'role': 'img', '[attr.aria-label]': 'summary()', '[title]': 'summary()'},
})
export class HpRingComponent {
  private static rings = 0;
  character = input.required<ApplyCharacterService>();
  // each ring's own gradient: an id is page wide, and the side bar shows several rings
  readonly gradientId = `hp-ring-gradient-${HpRingComponent.rings++}`;

  parts = computed(() => hpBarParts(this.character().raw(), this.character().applied()));
  summary = computed(() => hpSummaryOf(this.character().raw(), this.character().applied()));

  // an arc of that share of the ring, then a gap the rest of the way round
  arc(share: number): string {
    return `${share} ${100 - share}`;
  }
}
