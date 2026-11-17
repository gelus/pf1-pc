export type damageType = 'B'|'P'|'S';

// how a manufactured weapon is wielded, see rules/attacks.ts
//  primary: in the primary hand, 1x the strength bonus to damage
//  off: in the off hand, 1/2 the strength bonus, the off-hand attack of two-weapon fighting
//  two-handed: in both hands, 1 1/2 the strength bonus (a light weapon gets no more than in the primary hand)
export type AttackHand = 'primary' | 'off' | 'two-handed';
export const attackHands: AttackHand[] = ['primary', 'off', 'two-handed'];

// how strength adds to the damage of a bow (core rulebook, weapon descriptions)
//  '': strength adds as damageAbility says (a sling or thrown weapon takes str, a crossbow nothing)
//  bow: a longbow or shortbow, only a strength penalty applies, never a bonus
//  composite: a composite bow, the penalty applies and the bonus up to the bow's compositeRating. with a strength
//             modifier below the rating the bow is not used effectively: -2 to hit
export type BowKind = '' | 'bow' | 'composite';

// one line of what makes up a number of an attack, for the tooltip and anyone reading the applied attack
export interface AttackPart {
  value: number;
  origin: string;
  type?: string;
  // a part that does not count: a bonus of the same type that is larger applies instead
  overwritten?: boolean;
}

// what the attacks rule worked out for an attack of the applied character, never saved. every number is final:
// attackBonuses holds the total bonus of every attack roll the attack makes in a full attack, in order
export interface AttackResult {
  // "+11/+6/+1", one entry per attack roll (iteratives, extra off-hand attacks, each of count natural attacks)
  attackBonuses: number[];
  // what makes up the first attack bonus, the others take 5 less each
  toHit: {total: number, parts: AttackPart[]};
  damage: {
    // the dice after a change of size, and the dice as written
    dice: string,
    baseDice: string,
    bonus: number,
    parts: AttackPart[],
    // what is rolled: "2d6+9"
    expression: string,
  };
  // "19-20/x2"
  critical: string;
  range?: {increment: number, maxIncrements: number, maxRange: number, kind: 'thrown' | 'projectile'};
  ammunition?: {itemId: string, name: string, quantity: number};
  notes: string[];
}

export class Attack {
  type: 'iterative'|'natural'= 'iterative';
  name: string = '';
  damage: string = '';
  toHitAbility: string = '';
  toHitBonus: number = 0;
  damageAbility: string = '';
  damageBonus:number = 0;
  crit: number = 20;
  critMultiplier: number = 2;
  // the range increment in feet, 0 for a weapon that cannot be thrown or shot
  range: number = 0;
  damageType: damageType[] = ['B'];
  // manufactured weapons: how it is wielded, and whether it is a light weapon
  hand: AttackHand = 'primary';
  light: boolean = false;
  // natural attacks: a secondary attack (-5 to hit, 1/2 str), and how many of them the creature has (2 claws)
  secondary: boolean = false;
  count: number = 1;
  // a masterwork weapon gets +1 to hit, an enhancement bonus adds to hit and damage, the larger of both to hit
  masterwork: boolean = false;
  enhancement: number = 0;
  // a thrown weapon (max 5 range increments, takes str to damage like melee), anything else ranged is a projectile
  thrown: boolean = false;
  bow: BowKind = '';
  compositeRating: number = 0;
  // the id of the inventory item a ranged attack uses as ammunition
  ammunitionId: string = '';
  // a touch attack (or one dealing no hp damage) gets nothing from power attack or deadly aim
  touch: boolean = false;
  // the inventory item giving the attack, filled in by the engine for the attacks of equipped items
  itemId?: string;
  // worked out by the attacks rule on the applied character only
  result?: AttackResult;
}

export class RangeAttack extends Attack { }

export class MeleeAttack extends Attack { }

// what lessens the penalties of two-weapon fighting and the extra off-hand attacks, features adjust it
// Two-Weapon Fighting: {"twoWeaponFighting.primaryPenaltyReduction": 2, "twoWeaponFighting.offHandPenaltyReduction": 6}
// Improved / Greater Two-Weapon Fighting: {"twoWeaponFighting.extraOffHandAttacks": 1} each
export interface TwoWeaponFighting {
  primaryPenaltyReduction: number;
  offHandPenaltyReduction: number;
  extraOffHandAttacks: number;
}

export const defaultTwoWeaponFighting = (): TwoWeaponFighting =>
  ({primaryPenaltyReduction: 0, offHandPenaltyReduction: 0, extraOffHandAttacks: 0});
