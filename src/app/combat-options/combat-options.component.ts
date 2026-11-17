import { Component, computed } from '@angular/core';
import { ApplyCharacterService } from '../apply-character.service';
import {
  CombatOption,
  alwaysAvailableCombatOptions,
  combatOptionLabels,
} from '../interfaces/character.interface';
import { defaultCombatOptions } from '../utils/character.class';
import { defensiveCombatOptionSummary, excludedCombatOptions } from '../rules/defensive-combat';

// the combat options the character can use right now, each a toggle. what an option does is up to the rules,
// this only shows the ones available (see alwaysAvailableCombatOptions) and keeps which are on
@Component({
  selector: 'app-combat-options',
  templateUrl: './combat-options.component.html',
  styleUrl: './combat-options.component.sass'
})
export class CombatOptionsComponent {
  constructor(public character: ApplyCharacterService) {}

  options = computed((): {option: CombatOption, label: string, on: boolean, summary?: string}[] => {
    const applied = this.character.applied();
    return (Object.keys(combatOptionLabels) as CombatOption[])
      .filter(option => alwaysAvailableCombatOptions.includes(option) || applied.availableCombatOptions?.[option])
      .map(option => ({
        option,
        label: combatOptionLabels[option],
        on: Boolean(applied.combatOptions?.[option]),
        // what the option does, shown while it is on
        summary: defensiveCombatOptionSummary(applied, option),
      }));
  });

  toggle(option: CombatOption, on: boolean): void {
    const raw = this.character.raw();
    // turning an option on turns off those it can not be used with (fighting defensively and total defense)
    const excluded = on ? Object.fromEntries(excludedCombatOptions(option).map(other => [other, false])) : {};
    this.character.update({combatOptions: {...defaultCombatOptions(), ...raw.combatOptions, ...excluded, [option]: on}});
  }
}
