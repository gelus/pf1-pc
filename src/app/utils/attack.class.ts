export type damageType = 'B'|'P'|'S';

export class Attack {
  type: 'iterative'|'natural'= 'iterative';
  name: string = '';
  damage: string = '';
  toHitAbility: string = '';
  toHitBonus: number = 0;
  damageAbility: string = '';
  crit: number = 20;
  critMultiplier: number = 2;
  range: number = 0;
  damageType: damageType[] = ['B']
}

export class RangeAttack extends Attack { }

export class MeleeAttack extends Attack { }
