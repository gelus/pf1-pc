import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { masterCopyOf } from './companions';
import { eidolonWarnings, evolutionPool } from './eidolon.rule';
import { availableFeats } from './class-progression';
import { skillRankBudget } from '../characterPipes/remaining-ranks.pipe';
import { MeleeAttack } from '../utils/attack.class';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { explainStat } from '../ai/character-reader';

// an eidolon by its summoner level, its evolutions held to its pool and its most attacks: a summoner 5's biped
describe('eidolon rule', () => {
  let service: ApplyCharacterService;
  const claw = () => Object.assign(new MeleeAttack(), {name: 'Claw', type: 'natural', damage: '1d4', count: 2, toHitAbility: 'str', damageAbility: 'str'});
  const eidolonOf = (levels: number, link: object = {}, evolutions: Feature[] = []): Character => {
    const summoner = Object.assign(new Character(), {name: 'Balazar', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({name: 'Summoner', level: i + 1, hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['will'], skillRanks: 2, rolledHp: 5}))});
    const eidolon = Object.assign(new Character(), {name: 'Crimson',
      master: {masterId: summoner.id, kind: 'eidolon', classes: ['Summoner'], goodSaves: ['fort', 'will'], copy: masterCopyOf(summoner, summoner), ...link}});
    eidolon.abilityScores = {str: 16, dex: 12, con: 13, int: 7, wis: 10, cha: 11} as any;
    eidolon.race.features = [
      new Feature({name: 'Biped', adjustments: {size: {value: 4, mode: 'set'}, 'speed.land': {value: 30, mode: 'set'}, ac: {value: 2, type: 'natural armor'}} as any}),
      new Feature({name: 'Claws', cost: 0, adjustments: {melee: [claw()]} as any}),
      new Feature({name: 'Limbs (Arms)', cost: 0, adjustments: {}}),
      ...evolutions,
    ];
    return eidolon;
  };
  const total = (stat: string) => (explainStat(service, stat) as any).total;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('has the Hit Dice, attack bonus, saves, hit points, skills and feats of its summoner level', () => {
    service.initializeCharacter(eidolonOf(5, {increases: ['str']}));
    const applied = service.applied();
    // 4 HD: BAB +4, good Fort and Will +4, poor Ref +1
    expect(applied.bab).toBe(4);
    expect(total('saves.fort')).toBe(4 + 1);
    expect(total('saves.ref')).toBe(1 + 2);
    // 4 d10 on average (22) with its Con +1 a HD
    expect(applied.hp).toBe(22 + 4);
    // 6 + Int (-2) a HD
    expect(skillRankBudget(applied).available).toBe(16);
    expect(availableFeats(applied)).toBe(2);
    // the armor bonus of 5th (+4) on its base form's +2, Str 16 + 2 + its increase
    expect(applied.abilityScores.str).toBe(19);
    expect(applied.senses).toEqual(jasmine.objectContaining({darkvision: 60}));
    // its base form's +2 natural armor and the +4 armor bonus of 5th stack (touch AC takes neither)
    expect(total('ac')).toBe(10 + 2 + 4 + 2);
    expect(total('touchAc')).toBe(10 + 2);
    expect(applied.defensiveAbilities.map(f => f.name)).toEqual(['Evasion']);
  });

  it('has the evolution pool of its summoner', () => {
    expect(evolutionPool(eidolonOf(5).master)).toBe(8);
    expect(evolutionPool(eidolonOf(5, {unchained: true}).master)).toBe(4);
  });

  it('holds its evolutions to its pool, its most attacks, their levels and what they require', () => {
    const bite = Object.assign(new MeleeAttack(), {name: 'Bite', type: 'natural', damage: '1d6', toHitAbility: 'str', damageAbility: 'str'});
    const raw = eidolonOf(1, {}, [
      new Feature({name: 'Bite', cost: 1, adjustments: {melee: [bite]} as any}),
      new Feature({name: 'Flight', cost: 2, atLevel: 5, adjustments: {'speed.fly': {value: 30, mode: 'set'}} as any}),
      new Feature({name: 'Rend', cost: 2, prerequisites: 'Tail', adjustments: {}}),
    ]);
    service.initializeCharacter(raw);
    const warnings = eidolonWarnings(service.raw(), service.applied()).join(' | ');
    expect(warnings).toContain('its evolutions cost 5 points, its pool at level 1 is 3');
    // two claws and a bite: at its most of 3
    expect(warnings).not.toContain('natural attacks, its most');
    expect(warnings).toContain('Flight is taken at summoner level 5');
    expect(warnings).toContain('Rend requires Tail');
    // the flight it took too early does not apply
    expect(service.applied().speed.fly).toBeFalsy();
  });

  it('asks for the good saves of its base form', () => {
    service.initializeCharacter(eidolonOf(1, {goodSaves: []}));
    expect(eidolonWarnings(service.raw(), service.applied()).join(' ')).toContain('no good saves');
  });
});
