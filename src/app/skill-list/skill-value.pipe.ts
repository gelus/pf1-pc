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

  transform(skill: Skill, character:Character): number {
    return skill.ranks +
      AbilityModPipe.algorithm(character.abilityScores[skill.baseAbility]) +
      (skill.classSkill && skill.ranks > 0 ? 3:0)
  }

}
