import { Pipe, PipeTransform } from '@angular/core';
import {Character} from '../utils/character.class';
import {AbilityModPipe} from '../ability-mod.pipe';
import {isSkillFamily} from '../utils/skilllist.class';

@Pipe({
  name: 'remainingRanks'
})
export class RemainingRanksPipe implements PipeTransform {

  transform(character: Character): unknown {
    const intMod = AbilityModPipe.algorithm(character.abilityScores.int);
    let available = 0;
    let spent = 0;
    for (const classLevel of character.classLevels || []) {
      available += Math.max(classLevel.skillRanks + intMod, 1) * classLevel.level;
    }
    for (const [key, skill] of Object.entries(character.skills || {})) {
      if (isSkillFamily(key)) {
        for (const subSkill of Object.values(skill.subSkills || {})) {
          spent += subSkill.ranks || 0;
        }
      } else {
        spent += skill.ranks || 0;
      }
    }
    return `${available - spent}/${available}`;
  }

}
