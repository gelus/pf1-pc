import { Injectable, Pipe, PipeTransform } from '@angular/core';

export const AbilityModAlgorithm = (v:number, max:number = Infinity) => Math.min(Math.floor((v-10)/2), max)

// the points of damage an ability of the character took, whole and never negative
export const abilityDamagePoints = (char: any, ability: string): number =>
  Math.max(0, Math.floor(Number(char?.abilityDamage?.[ability]) || 0));

// ability damage does not lower the score: every 2 points of it give a -1 penalty to the skills and statistics that
// take the ability's modifier (core rulebook, glossary, ability damage). this is that penalty, 0 or less
export const abilityDamagePenalty = (char: any, ability: string): number =>
  0 - Math.floor(abilityDamagePoints(char, ability) / 2);

// the modifier of an ability of the character, what everything taking the modifier of a character must use
// max caps the bonus the score gives (the max dex bonus of armor caps the dex bonus to ac). the damage penalty comes
// after that cap: the cap limits the bonus the score gives, the penalty of the damage is a penalty on top of it
// a character without abilityDamage (a raw character on the point buy) simply takes the modifier of its score, a
// score that is missing counts as 10
export const abilityModifier = (char: any, ability: string, max: number = Infinity): number =>
  AbilityModAlgorithm(Number(char?.abilityScores?.[ability] ?? 10) || 0, max) + abilityDamagePenalty(char, ability);

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
