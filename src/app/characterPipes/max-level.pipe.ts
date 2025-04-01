import { Pipe, PipeTransform } from '@angular/core';
import {ClassLevel} from '../utils/classlevel.class';
import {Character} from '../utils/character.class';

@Pipe({
  name: 'maxLevel'
})
export class MaxLevelPipe implements PipeTransform {

  transform(character: Character): number {
    return character.classLevels.reduce((t:number,c: ClassLevel) => t+c.level, 0);
  }

}
