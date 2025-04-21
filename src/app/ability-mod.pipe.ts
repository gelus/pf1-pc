import { Injectable, Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'abilityMod',
  standalone: true,
})
@Injectable()
export class AbilityModPipe implements PipeTransform {

  static algorithm = (v:number, max:number = Infinity) => Math.min(Math.floor((v-10)/2), max);

  transform(value: number, max: number = Infinity): number {
    return AbilityModPipe.algorithm(value, max);
  }

}
