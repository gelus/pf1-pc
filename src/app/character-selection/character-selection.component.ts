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

  newCharacter(){
    const newCharacter = new Character();
    this.characters.push(newCharacter);
    ls.setItem('character-'+newCharacter.id, newCharacter);
    this.updateLocalStorage();
    this.router.navigate([newCharacter.id]);
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
