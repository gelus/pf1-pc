import {Component, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {ApplyCharacterService} from '../apply-character.service';
import {CharacterRegistry} from '../character-registry.service';
import {COMPANION_KINDS, CompanionKind, advancesWithMaster, hasAnimalTable} from '../rules/companions';
import {PartyMemberComponent} from './party-member.component';

// the side bar's party: the master and, under it, its companions (collapsible), each a member with its pop-out. on a
// companion's sheet its master leads, so the two are a click apart. a party of several characters will list each
// member with its companions under it the same way. a companion is added here (name and kind), its sheet opened
@Component({
  selector: 'app-party-nav',
  imports: [FormsModule, PartyMemberComponent],
  templateUrl: './party-nav.component.html',
  styleUrl: './party-nav.component.sass',
})
export class PartyNavComponent {
  private open = inject(ApplyCharacterService);
  private registry = inject(CharacterRegistry);
  private router = inject(Router);
  readonly kinds = COMPANION_KINDS;

  // the master leads: the open character, or the master of the open companion
  leader = computed((): ApplyCharacterService => {
    const master = this.open.raw().master?.masterId;
    return (master && this.registry.serviceFor(master)) || this.open;
  });
  companions = computed(() => this.registry.companionsOf(this.leader().raw()));
  isOpen = (service: ApplyCharacterService): boolean => service.raw().id === this.open.raw().id;
  // what it is to the party: a synthesist's eidolon is "fused" while its summoner's Fused form is on
  roleOf = (service: ApplyCharacterService): string => {
    const link = service.raw().master;
    if (!link) return '';
    const fused = link.synthesist && (this.leader().raw().conditions || []).some(c => c.form?.fusedWith === service.raw().id && c.active);
    return `${link.kind}${fused ? ', fused' : ''}`;
  };

  collapsed = signal(false);
  adding = signal(false);
  name = '';
  kind: CompanionKind = 'animal companion';

  // its sheet opens; with the AI, on the chat creating it (as a new character from the list does)
  // the master's classes, and those ticked as counting for the companion (a familiar's master class level)
  masterClasses = computed(() => [...new Set((this.leader().raw().classLevels || []).map(l => l.name))]);
  counted: {[className: string]: boolean} = {};
  countsLevels = (): boolean => advancesWithMaster({master: {masterId: '', kind: this.kind}});
  // an animal companion's or a mount's: what its class feature adds to the master class level (a ranger's: -3)
  levelOffset = 0;
  synthesist = false;
  hasOffset = (): boolean => hasAnimalTable({masterId: '', kind: this.kind});

  add(withAi = false): void {
    const classes = this.countsLevels() ? Object.entries(this.counted).filter(([, on]) => on).map(([c]) => c) : [];
    const id = this.registry.createCompanion(this.leader().raw().id, this.kind, this.name, classes,
      this.hasOffset() ? Math.floor(Number(this.levelOffset) || 0) : 0, this.kind === 'eidolon' && this.synthesist ? {synthesist: true} : {});
    this.synthesist = false;
    this.counted = {};
    this.levelOffset = 0;
    this.adding.set(false);
    this.name = '';
    if (id) this.router.navigate(['/', id], withAi ? {queryParams: {create: 'ai'}} : {});
  }
}
