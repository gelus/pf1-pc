import {Component, computed, input, output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApplyCharacterService} from '../apply-character.service';
import {currentHpChange} from '../rules/damage-taken';
import {HpBarComponent} from './hp-bar.component';

// the hit points of a character, set by hand: what is left after damage or healing, temporary hp, nonlethal damage.
// opened from the sheet's hp, and from a companion's side bar entry, for that character
@Component({
  selector: 'app-health-dialog',
  imports: [FormsModule, HpBarComponent],
  templateUrl: './health-dialog.component.html',
  styleUrl: './health-dialog.component.sass',
})
export class HealthDialogComponent {
  character = input.required<ApplyCharacterService>();
  closed = output<void>();

  applied = computed(() => this.character().applied());
  raw = computed(() => this.character().raw());

  private points = (value: unknown): number => Math.max(0, Math.floor(Number(value) || 0));

  setCurrentHp(value: unknown): void {
    if (value === null || value === '') return;
    const service = this.character();
    service.update(currentHpChange(service.raw(), service.applied(), Number(value) || 0));
  }
  setTempHp(value: unknown): void { this.character().update({tempHp: this.points(value)}); }
  setNonlethal(value: unknown): void { this.character().update({nonlethalDamage: this.points(value)}); }
}
