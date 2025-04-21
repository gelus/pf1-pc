import { Component, WritableSignal, signal } from '@angular/core';
import { sizes } from '../interfaces/character.interface';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AddFeatureModalComponent } from '../add-feature-modal/add-feature-modal.component';
import { ls } from '../utils/localstorage.util';
import { Character } from '../utils/character.class';
import { Router, RouterLink } from '@angular/router';
import { ClassLevel } from '../utils/classlevel.class';
import { AbilityModPipe } from '../ability-mod.pipe';
import { SkillListComponent } from '../skill-list/skill-list.component';
import { InventoryListComponent } from '../inventory-list/inventory-list.component';
import { RemainingStartingWealthPipe } from '../characterPipes/remaining-starting-wealth.pipe';
import {ApplyCharacterService} from '../apply-character.service';

@Component({
  selector: 'app-new-character',
  imports: [CommonModule, FormsModule, AddFeatureModalComponent, InventoryListComponent, RouterLink, AbilityModPipe, SkillListComponent],
  providers: [RemainingStartingWealthPipe],
  templateUrl: './new-character.component.html',
  styleUrl: './new-character.component.sass'
})

export class NewCharacterComponent {

  statPoints: string = 'Custom'
  pointOptions: string[] = ['Custom', '10', '15', '20', '25']

  getAbilityScoreCost(abilityKey: string): number {
    const characterData = this.character.raw()

    let baseScore = characterData.abilityScores[abilityKey]

    switch (baseScore) {
      case 7: return -4
      case 8: return -2
      case 9: return -1
      case 10: return 0
      case 11: return 1
      case 12: return 2
      case 13: return 3
      case 14: return 5
      case 15: return 7
      case 16: return 10
      case 17: return 13
      case 18: return 17
      default: return 0

    }
  }

  totalCosts(): number {
    const characterData = this.character.raw()
    let total = 0
    for (const abilityKey in characterData.abilityScores) {
      total += this.getAbilityScoreCost(abilityKey)
    }
    return total
  }

  sizes = sizes;
  parseInt = parseInt;

  constructor(
    private router: Router,
    private remainingStartingWealthPipe: RemainingStartingWealthPipe,
    public character: ApplyCharacterService
  ) {
    this.character.initializeCharacter(new Character(), false);

    this.character.update({
      race: {
        name: '',
        subtype: '',
        features: [{
          name: "racial-stats", id: 'racial-stats', adjustments: {
            "speed.land": 30,
            "size": 4,
            "languages": 'Common'
          }
        }]
      },
      classLevels: [new ClassLevel({
        name: 'Barbarian',
        hitDice: 12,
        classSkills: ['acrobatics', 'climb', 'craft', 'handle animal', 'intimidate', 'knowledge (nature)', 'perception', 'ride', 'survival', 'swim'],
        skillRanks: 4,
        startingWealth: 105,
      })]
    })

  }

  keyValueOriginalOrder = (): number => 0;

  consumeClassLevelString(classLevel: string) {
    try {
      this.character.update({ classLevels: [JSON.parse(classLevel.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''))] })
    } catch (e) {/* swallow it */ }
  }

  saveCharacter() {
    const character = this.character.raw();
    const characterIds: Array<string> = (ls.getItem('characters') || []);
    characterIds.push(character.id);

    // Assign remaining starting wealth to the character's wealth
    character.wealth = this.remainingStartingWealthPipe.transform(character);

    ls.setItem('character-' + character.id, character);
    ls.setItem('characters', characterIds);

    this.router.navigate([character.id]);
  }

}
