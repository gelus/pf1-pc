import { Pipe, PipeTransform } from '@angular/core';
import {Character} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';

// the most ranks a skill can have, one per character level
@Pipe({
  name: 'maxLevel'
})
export class MaxLevelPipe implements PipeTransform {

  transform(character: Character): number {
    return characterLevel(character);
  }

}
