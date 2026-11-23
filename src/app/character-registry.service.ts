import {EnvironmentInjector, Injectable, effect, inject, runInInjectionContext, signal, untracked} from '@angular/core';
import {ApplyCharacterService} from './apply-character.service';
import {CompanionKind, CompanionLink, masterCopyOf, sameCopy} from './rules/companions';
import {fusedForm} from './rules/synthesist';
import {Character} from './utils/character.class';
import {ls} from './utils/localstorage.util';

// the characters the app works with at once: the one whose sheet is open (the app's ApplyCharacterService, which the
// sheet and everything on it use) and the others it shows (a companion's side bar entry, its hit points dialog), each
// worked out by an ApplyCharacterService of its own, with its own undo history. opening a character hands its data
// and history to the open sheet, and keeps the one it leaves, so going to a companion and back keeps both histories.
// a master's companions keep their copy of it fresh (rules/companions.ts)
@Injectable({providedIn: 'root'})
export class CharacterRegistry {
  private open = inject(ApplyCharacterService);
  private injector = inject(EnvironmentInjector);
  private others = new Map<string, ApplyCharacterService>();
  // bumped when a character is created or removed, for the lists that show them
  readonly changed = signal(0);

  constructor() {
    // the open character's companions keep their copy of it fresh, whenever it changes
    effect(() => {
      const raw = this.open.raw();
      const applied = this.open.applied();
      untracked(() => {
        this.refreshCompanions(raw, applied);
        // an open synthesist's eidolon keeps its summoner's Fused form up with it
        this.refreshFusion(this.open);
      });
    });
  }

  private stored = (id: string): boolean => !!id && !!ls.getItem('character-' + id);

  private instance(character: Character, history?: ReturnType<ApplyCharacterService['history']['state']>): ApplyCharacterService {
    const service = runInInjectionContext(this.injector, () => new ApplyCharacterService());
    service.initializeCharacter(character, true, history);
    return service;
  }

  // the service of a character by its id: the open sheet's, or one of its own. undefined for one not saved
  serviceFor(id: string | undefined): ApplyCharacterService | undefined {
    if (!id) return undefined;
    if (this.open.raw()?.id === id) return this.open;
    const known = this.others.get(id);
    if (known) return known;
    if (!this.stored(id)) return undefined;
    const service = this.instance(new Character(id));
    this.others.set(id, service);
    return service;
  }

  // opens a character on the sheet: its data and its undo history from where it was shown, the one left kept with its own
  openCharacter(id: string): void {
    const leaving = this.open.raw();
    const leavingHistory = this.open.history.state();
    // the same character again (back from the character list): its saved data, which the list may have changed
    // (a companion deleted), with the history it had
    if (leaving?.id === id) {
      this.open.initializeCharacter(new Character(id), true, leavingHistory);
      this.refreshCopy(this.open);
      return;
    }
    const shown = this.others.get(id);
    this.open.initializeCharacter(shown ? JSON.parse(JSON.stringify(shown.raw())) : new Character(id), true, shown?.history.state());
    this.others.delete(id);
    if (leaving?.id && leaving.id !== id && this.stored(leaving.id)) {
      this.others.set(leaving.id, this.instance(JSON.parse(JSON.stringify(leaving)), leavingHistory));
    }
    this.refreshCopy(this.open);
    this.refreshFusion(this.open);
  }

  // a synthesist's Fused form (rules/synthesist.ts), from its eidolon as it is: added when the eidolon is a synthesist's,
  // kept up with it, taken away when it no longer is. no step of the summoner's undo history
  private refreshFusion(eidolon: ApplyCharacterService): void {
    const raw = eidolon.raw();
    const link = raw.master;
    if (link?.kind !== 'eidolon') return;
    const master = this.serviceFor(link.masterId);
    if (!master) return;
    const conditions = master.raw().conditions || [];
    const existing = conditions.find(c => c.form?.fusedWith === raw.id);
    if (!link.synthesist) {
      if (existing) master.sync({conditions: conditions.filter(c => c !== existing)});
      return;
    }
    const applied = eidolon.applied();
    const next = fusedForm(raw, applied, eidolon.adjustmentsMap, existing, masterCopyOf(master.raw(), master.applied()).bab);
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return;
    master.sync({conditions: existing ? conditions.map(c => c === existing ? next : c) : [...conditions, next]});
  }

  // a companion's copy of its master, refreshed from the master as it is now
  private refreshCopy(companion: ApplyCharacterService): void {
    const link = companion.raw().master;
    const master = link ? this.serviceFor(link.masterId) : undefined;
    if (!link || !master) return;
    const copy = masterCopyOf(master.raw(), master.applied());
    if (!sameCopy(link.copy, copy)) companion.sync({master: {...link, copy}});
  }

  private refreshCompanions(raw: Character, applied: Character): void {
    for (const id of raw.companions || []) {
      const companion = id === raw.id ? undefined : this.serviceFor(id);
      const link = companion?.raw().master;
      if (!companion || !link || link.masterId !== raw.id) continue;
      const copy = masterCopyOf(raw, applied);
      if (!sameCopy(link.copy, copy)) companion.sync({master: {...link, copy}});
      this.refreshFusion(companion);
    }
  }

  // a new companion of a master, saved and listed with it: one step of the master's undo history (its list), the
  // companion a character of its own
  // classes: the master's classes whose levels count for it (a familiar's master class level)
  createCompanion(masterId: string, kind: CompanionKind, name: string, classes: string[] = [], levelOffset = 0,
    more: Partial<CompanionLink> = {}): string | undefined {
    const master = this.serviceFor(masterId);
    if (!master) return undefined;
    const companion = new Character();
    companion.name = name.trim() || `${master.raw().name}'s ${kind}`;
    companion.master = {masterId, kind, copy: masterCopyOf(master.raw(), master.applied()), ...(classes.length ? {classes} : {}),
      ...(levelOffset ? {levelOffset} : {}), ...more};
    ls.setItem('character-' + companion.id, companion);
    master.labelled(`add the ${kind} ${companion.name}`, () => master.update({companions: [...(master.raw().companions || []), companion.id]}));
    this.changed.update(n => n + 1);
    // a synthesist's eidolon: its summoner gets its Fused form at once
    if (companion.master.synthesist) this.refreshFusion(this.serviceFor(companion.id)!);
    return companion.id;
  }

  // the companions of a master that are saved, in its order
  companionsOf(master: Character): ApplyCharacterService[] {
    this.changed();
    return (master.companions || []).map(id => this.serviceFor(id)).filter((s): s is ApplyCharacterService => !!s);
  }

  // a character deleted or changed outside its service (the character list): its own service let go, so the next
  // one reads what is saved
  forget(id: string): void {
    this.others.delete(id);
    this.changed.update(n => n + 1);
  }
}
