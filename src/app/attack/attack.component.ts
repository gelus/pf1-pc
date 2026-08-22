import { Component, Input, computed } from '@angular/core';
import {Attack} from '../utils/attack.class';
import {ApplyCharacterService} from '../apply-character.service';
import {AbilityModPipe} from '../ability-mod.pipe';
import {StatDisplayComponent} from '../stat-display/stat-display.component';

@Component({
  selector: 'app-attack',
  imports: [
    AbilityModPipe,
    StatDisplayComponent,
  ],
  templateUrl: './attack.component.html',
  styleUrl: './attack.component.sass'
})
export class AttackComponent {
  @Input() attack!: Attack;
  constructor (
    public character: ApplyCharacterService
  ) {}

  isMelee = computed(() => this.character.applied().melee.includes(this.attack));
  isRanged = computed(() => this.character.applied().ranged.includes(this.attack));

  attackRollBonuses = computed(() => {
    const char = this.character.applied();
    const bonuses: Array<[number, string]> = [];
    
    if (this.attack?.toHitBonus) {
      bonuses.push([this.attack.toHitBonus, 'bonus']);
    }
    
    if (char.attackRollBonus) {
      bonuses.push([char.attackRollBonus, 'all attacks']);
    }
    
    if (this.isMelee() && char.meleeAttackRollBonus) {
      bonuses.push([char.meleeAttackRollBonus, 'melee attacks']);
    } else if (this.isRanged() && char.rangedAttackRollBonus) {
      bonuses.push([char.rangedAttackRollBonus, 'ranged attacks']);
    }
    
    return bonuses;
  });

  attackRollTooltips = computed(() => {
    this.character.applied();

    const tooltips: Array<[number|string, string]> = [];
    
    if (this.attack?.toHitBonus) {
      tooltips.push([this.attack.toHitBonus, 'bonus']);
    }

    const attackRollBonusAdjustments = this.character.adjustmentsMap['attackRollBonus'] || [];
    for (const adj of attackRollBonusAdjustments) {
      tooltips.push([adj.value, adj.origin]);
    }
    
    if (this.isMelee()) {
      const meleeAdjustments = this.character.adjustmentsMap['meleeAttackRollBonus'] || [];
      for (const adj of meleeAdjustments) {
        tooltips.push([adj.value, adj.origin]);
      }
    } else if (this.isRanged()) {
      const rangedAdjustments = this.character.adjustmentsMap['rangedAttackRollBonus'] || [];
      for (const adj of rangedAdjustments) {
        tooltips.push([adj.value, adj.origin]);
      }
    }
    
    return tooltips;
  });
}
