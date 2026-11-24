import {Component, computed, input, signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {ApplyCharacterService} from '../apply-character.service';
import {HealthDialogComponent} from '../hit-points/health-dialog.component';
import {HpBarComponent} from '../hit-points/hp-bar.component';
import {HpRingComponent} from '../hit-points/hp-ring.component';
import {HpTextComponent} from '../hit-points/hp-text.component';
import {quickStats, signed} from './quick-stats';

// whether the side bar's health shows as a ring around the picture (true) or a straight bar under it (false)
export const HP_RING = true;

// a character in the side bar: its picture (the first letter of its name, while pictures are not kept) in a health
// ring (or over a small health bar, see HP_RING), a link to its sheet. hovering or focusing it pops out what a fight asks of it to the right: its name,
// initiative, AC, saves and its hit points, which open its hit points dialog. made for a companion, for its master,
// and for a party's members
@Component({
  selector: 'app-party-member',
  imports: [RouterLink, HpBarComponent, HpRingComponent, HpTextComponent, HealthDialogComponent],
  templateUrl: './party-member.component.html',
  styleUrl: './party-member.component.sass',
})
export class PartyMemberComponent {
  character = input.required<ApplyCharacterService>();
  // the character whose sheet is open
  current = input(false);
  // what it is to the party: "familiar", "master"
  role = input('');
  readonly ringed = HP_RING;

  raw = computed(() => this.character().raw());
  initial = computed(() => (this.raw().name || '?').trim().charAt(0).toUpperCase() || '?');
  stats = computed(() => quickStats(this.character()));
  readonly signed = signed;

  popped = signal(false);
  healthOpen = signal(false);
  // the pop-out stays while the pointer is on it, or the hit points dialog it opened is open
  show(): void { this.popped.set(true); }
  hide(): void { if (!this.healthOpen()) this.popped.set(false); }
  // focus going to the pop-out's own hit points keeps it open
  leave(event: FocusEvent): void {
    const within = event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget);
    if (!within) this.hide();
  }
  openHealth(): void {
    this.healthOpen.set(true);
  }
  closeHealth(): void {
    this.healthOpen.set(false);
    this.popped.set(false);
  }
}
