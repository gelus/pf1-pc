import { Injectable, Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'abilityMod',
  standalone: true,
})
@Injectable()
export class AbilityModPipe implements PipeTransform {

  static algorithm = (v:number) => Math.floor((v-10)/2);

  transform(value: number, bonus: number = 0): number {
    return AbilityModPipe.algorithm(value) + bonus;
  }

}
