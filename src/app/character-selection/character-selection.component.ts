import { Component } from '@angular/core';
import { ls } from '../utils/localstorage.util';
import {Character} from '../utils/character.class';
import {Router, RouterLink} from '@angular/router';

@Component({
  selector: 'app-character-selection',
  imports: [RouterLink],
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

  deleteCharacter(charId: string) {
    this.characters.splice(this.characters.findIndex(c => c.id === charId), 1);
    ls.removeItem('character-'+charId);
    this.updateLocalStorage();
  }

  updateLocalStorage() {
    ls.setItem('characters', this.characters.map(c => c.id));
  }

}
