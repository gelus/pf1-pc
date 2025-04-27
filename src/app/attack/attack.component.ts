import { Component, Input } from '@angular/core';
import {Attack, MeleeAttack, RangeAttack} from '../utils/attack.class';
import {ApplyCharacterService} from '../apply-character.service';
import {AbilityModPipe} from '../ability-mod.pipe';
import {PosNegNumberPipe} from '../pos-neg-number.pipe';
import {StatDisplayComponent} from '../stat-display/stat-display.component';

@Component({
  selector: 'app-attack',
  imports: [
    AbilityModPipe,
    PosNegNumberPipe,
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
}
