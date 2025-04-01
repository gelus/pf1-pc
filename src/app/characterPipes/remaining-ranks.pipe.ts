import { Pipe, PipeTransform } from '@angular/core';
import {Character} from '../utils/character.class';
import {AbilityModPipe} from '../ability-mod.pipe';

@Pipe({
  name: 'remainingRanks'
})
export class RemainingRanksPipe implements PipeTransform {

  transform(character: Character): unknown {
    const intMod = AbilityModPipe.algorithm(character.abilityScores.int);
    let available = 0;
    let spent = 0;
    for ( const classLevel of character.classLevels) available += Math.max(classLevel.skillRanks + intMod, 1) * classLevel.level;
    for (let skill of Object.values(character.skills)) spent += skill.ranks;
    return `${available-spent}/${available}`;
  }

}
