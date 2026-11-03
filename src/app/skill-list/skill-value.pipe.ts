import { Pipe, PipeTransform } from '@angular/core';
import {Skill} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {AbilityModPipe} from '../ability-mod.pipe';

@Pipe({
  name: 'skillValue',
  standalone: true,
})
export class SkillValuePipe implements PipeTransform {

  constructor() {}

  transform(skill: Skill, character: Character): number {
    const baseAbility = (skill.baseAbility || '').toLowerCase();
    const acp = baseAbility === 'str' || baseAbility === 'dex' ? (character.armorCheckPenalty || 0) : 0;
    return (
      (skill.ranks || 0) +
      (skill.value || 0) +
      AbilityModPipe.algorithm(character.abilityScores[skill.baseAbility]) +
      (skill.classSkill && skill.ranks > 0 ? 3 : 0) +
      (character.skillCheckBonus || 0) +
      acp
    );
  }

}
