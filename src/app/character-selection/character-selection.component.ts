import { Component, inject, signal } from '@angular/core';
import {CharacterRegistry} from '../character-registry.service';
import { ls } from '../utils/localstorage.util';
import {Character} from '../utils/character.class';
import {Router, RouterLink} from '@angular/router';
import {characterLevel} from '../utils/classlevel.class';
import {ThemeToggleComponent} from '../theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-character-selection',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './character-selection.component.html',
  styleUrl: './character-selection.component.sass'
})
export class CharacterSelectionComponent {

  constructor(
    private router: Router
  ){}

  characters: Array<Character> = (ls.getItem('characters') || []).map((id: string) => new Character(id))

  // a blank character, opened on its sheet. with the AI, the sheet opens the chat to create it in conversation
  newCharacter(withAi = false){
    const newCharacter = new Character();
    this.characters.push(newCharacter);
    ls.setItem('character-'+newCharacter.id, newCharacter);
    this.updateLocalStorage();
    this.router.navigate([newCharacter.id], withAi ? {queryParams: {create: 'ai'}} : {});
  }

  level(character: Character): number {
    return characterLevel(character);
  }

  // the race and the classes, one name per class however many levels it has
  meta(character: Character): string {
    const classes = [...new Set((character.classLevels || []).map(c => c.name).filter(Boolean))];
    return [character.race?.name, classes.join(' / ')].filter(Boolean).join(' · ') || 'No race or class yet';
  }

  private registry = inject(CharacterRegistry);

  // a master's companions, saved characters of their own listed under it (rules/companions.ts)
  companionsOf(character: Character): Character[] {
    return (character.companions || []).filter(id => ls.getItem('character-' + id)).map(id => new Character(id));
  }
  // the masters whose companions are hidden
  collapsed = signal<Set<string>>(new Set());
  toggle(id: string): void {
    const next = new Set(this.collapsed());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.collapsed.set(next);
  }

  // a master with companions asks first: they go with it, or stay as characters of their own
  deleting = signal<Character | undefined>(undefined);
  deleteCharacter(charId: string) {
    const character = this.characters.find(c => c.id === charId);
    if (character && this.companionsOf(character).length) {
      this.deleting.set(character);
      return;
    }
    this.remove(charId);
  }
  confirmDelete(companions: 'delete' | 'keep'): void {
    const master = this.deleting();
    this.deleting.set(undefined);
    if (!master) return;
    for (const companion of this.companionsOf(master)) {
      if (companions === 'delete') {
        ls.removeItem('character-' + companion.id);
        this.registry.forget(companion.id);
      } else {
        // a character of its own from now on, in the list
        companion.master = undefined;
        ls.setItem('character-' + companion.id, companion);
        this.characters.push(companion);
      }
    }
    this.remove(master.id);
  }
  private remove(charId: string): void {
    this.characters.splice(this.characters.findIndex(c => c.id === charId), 1);
    ls.removeItem('character-'+charId);
    this.registry.forget(charId);
    this.updateLocalStorage();
  }

  // a companion deleted: off its master's list too
  deleteCompanion(master: Character, companionId: string): void {
    ls.removeItem('character-' + companionId);
    master.companions = (master.companions || []).filter(id => id !== companionId);
    ls.setItem('character-' + master.id, master);
    this.registry.forget(companionId);
    this.registry.forget(master.id);
  }

  updateLocalStorage() {
    ls.setItem('characters', this.characters.map(c => c.id));
  }

}
