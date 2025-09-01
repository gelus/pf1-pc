import { Injectable, Pipe, PipeTransform } from '@angular/core';

export const AbilityModAlgorithm = (v:number, max:number = Infinity) => Math.min(Math.floor((v-10)/2), max)

@Pipe({
  name: 'abilityMod',
  standalone: true,
})
@Injectable()
export class AbilityModPipe implements PipeTransform {

  static algorithm = AbilityModAlgorithm;

  transform(value: number, max: number = Infinity): number {
    return AbilityModPipe.algorithm(value, max);
  }

}
