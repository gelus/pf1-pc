import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {ClassLevel} from '../utils/classlevel.class';
import {Attack} from '../utils/attack.class';
import {Feature} from '../interfaces/character.interface';
import {pickProblemsOf} from './picks';

// a class feature picked for again as the class levels: weapon training's groups, favored enemy's creatures
describe('picks of a class feature', () => {
  let service: ApplyCharacterService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });
  const levels = (name: string, count: number, first: Feature, picks: {[level: number]: ClassLevel['picks']}) =>
    Array.from({length: count}, (_, i) => new ClassLevel({name, level: i + 1, features: i === 0 ? [first] : [], ...(picks[i + 1] ? {picks: picks[i + 1]} : {})}));

  const training = new Feature({name: 'Weapon Training', adjustments: {
    'melee.@{pick}.toHitBonus': '{pick.amount}', 'melee.@{pick}.damageBonus': '{pick.amount}', 'cmb[{pick}]': '{pick.amount}',
  }, picks: {at: [5, 9, 13, 17], first: 1, by: 1, more: 'all', label: 'a weapon group'}} as any);

  it('gives every earlier weapon group one more with each new one', () => {
    const char = new Character();
    char.classLevels = levels('Fighter', 9, training, {5: {'Weapon Training': {pick: 'heavy blades'}}, 9: {'Weapon Training': {pick: 'bows'}}});
    char.feats.push(new Feature({name: 'Weapons', adjustments: {melee: [Object.assign(new Attack(), {name: 'Longsword', weapon: 'longsword', groups: ['heavy blades'], damage: '1d8'})]}}));
    service.initializeCharacter(char);
    const sword = service.applied().melee[0] as any;
    expect(sword.result.toHit.parts.find((p: any) => p.origin === 'Weapon Training')?.value).toBe(2);
    expect(service.adjustmentsMap['cmb'].filter(e => e.origin === 'Weapon Training').map(e => [e.variant, e.value])).toEqual([['heavy blades', 2], ['bows', 1]]);
    expect(pickProblemsOf(char)).toEqual([]);
  });

  it('raises the favored enemy a later level names, and tells a level owed its pick', () => {
    const enemy = new Feature({name: 'Favored Enemy', adjustments: {'attackRollBonus[{pick}]': '{pick.amount}', 'skills.survival.value[{pick}]': '{pick.amount}'},
      picks: {at: [1, 5, 10, 15, 20], first: 2, by: 2, more: 'one', label: 'a creature type'}} as any);
    const char = new Character();
    char.classLevels = levels('Ranger', 10, enemy, {1: {'Favored Enemy': {pick: 'undead'}}, 5: {'Favored Enemy': {pick: 'humanoid (orc)', raise: 'undead'}}});
    service.initializeCharacter(char);
    service.applied();
    expect(service.adjustmentsMap['attackRollBonus'].filter(e => e.origin === 'Favored Enemy').map(e => [e.variant, e.value])).toEqual([['undead', 4], ['humanoid (orc)', 2]]);
    expect(pickProblemsOf(char)).toEqual(['Ranger 10 gives a pick of Favored Enemy (a creature type) it has not made (add_class_level picks, or the class level form)']);
  });
});
