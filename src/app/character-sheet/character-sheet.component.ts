import { Component } from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {AbilityModPipe} from '../ability-mod.pipe';
import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AddFeatureModalComponent} from '../add-feature-modal/add-feature-modal.component';
import {sizes} from '../interfaces/character.interface';
import {InventoryListComponent} from '../inventory-list/inventory-list.component';
import {SkillValuePipe} from '../skill-list/skill-value.pipe';
import {SkillListComponent} from '../skill-list/skill-list.component';
import {StatDisplayComponent} from '../stat-display/stat-display.component';
import {ApplyCharacterService} from '../apply-character.service';
import {AttackComponent} from '../attack/attack.component';

@Component({
  selector: 'app-character-sheet',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AddFeatureModalComponent,
    InventoryListComponent,
    AbilityModPipe,
    SkillValuePipe,
    SkillListComponent,
    StatDisplayComponent,
    AttackComponent,
  ],
  templateUrl: './character-sheet.component.html',
  styleUrl: './character-sheet.component.sass'
})
export class CharacterSheetComponent {

  sizes = sizes;

  constructor(
    private route: ActivatedRoute,
    public character: ApplyCharacterService
  ) {
    this.character.initializeCharacter(new Character(this.route.snapshot.params['characterid']), true)
  }

}
