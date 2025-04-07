import { Component, WritableSignal, signal } from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {AbilityModPipe} from '../ability-mod.pipe';
import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AddFeatureModalComponent} from '../add-feature-modal/add-feature-modal.component';
import {sizes} from '../interfaces/character.interface';
import {CharacterAbstractComponent} from '../character-abstract.component';
import {InventoryListComponent} from '../inventory-list/inventory-list.component';
import {SkillValuePipe} from '../skill-list/skill-value.pipe';
import {SkillListComponent} from '../skill-list/skill-list.component';

@Component({
  selector: 'app-character-sheet',
  imports: [CommonModule, FormsModule, RouterLink, AddFeatureModalComponent, InventoryListComponent, AbilityModPipe, SkillValuePipe, SkillListComponent],
  templateUrl: './character-sheet.component.html',
  styleUrl: './character-sheet.component.sass'
})
export class CharacterSheetComponent extends CharacterAbstractComponent {

  sizes = sizes;
  override saveOnUpdate: boolean = true;

  character: WritableSignal<Character> = signal(new Character(this.route.snapshot.params['characterid']));

  constructor(
    private route: ActivatedRoute
  ) { super() }

}
