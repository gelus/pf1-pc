import {Component, HostBinding, computed, input} from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {hpBarParts, hpSummaryOf} from './hit-points';

// the health bar of a character: the current hp in the brand's colors, the temporary hp over them from the left, the
// nonlethal damage over their end. the character it shows is given, the sheet's or a companion's; the place it is in
// sizes it (a class of its own: the sticky header's thin bar)
@Component({
  selector: 'app-hp-bar',
  template: `
    <span class="hp-bar__current" [style.width.%]="parts().current"></span>
    <span class="hp-bar__nonlethal" [style.left.%]="parts().nonlethalFrom" [style.width.%]="parts().nonlethal"></span>
    <span class="hp-bar__temp" [style.width.%]="parts().temp"></span>`,
  styleUrl: './hp-bar.component.sass',
  host: {'class': 'hp-bar', 'role': 'img', '[attr.aria-label]': 'summary()', '[title]': 'summary()'},
})
export class HpBarComponent {
  character = input.required<ApplyCharacterService>();
  // the dialog's larger bar
  large = input(false);
  @HostBinding('class.hp-bar--large') get isLarge() { return this.large(); }

  parts = computed(() => hpBarParts(this.character().raw(), this.character().applied()));
  summary = computed(() => hpSummaryOf(this.character().raw(), this.character().applied()));
}
