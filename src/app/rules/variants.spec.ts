import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService, variantKey } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';
import { variantNameProblems } from '../ai/mechanics';

// a variant names its situation alone, and bonuses for one situation meet however it is spelled
describe('variants', () => {
  let service: ApplyCharacterService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('meets one situation however it is spelled', () => {
    expect(variantKey('Fear effects')).toBe(variantKey('fear'));
    expect(variantKey('vs. fear')).toBe(variantKey('fear'));
    expect(variantKey('diseases')).toBe(variantKey('disease'));
    expect(variantKey('mind affecting effects')).toBe(variantKey('mind-affecting'));
    expect(variantKey('spell-like abilities')).toBe(variantKey('spell-like ability'));
    expect(variantKey('darkness')).not.toBe(variantKey('dark'));
    expect(variantKey('giants')).not.toBe(variantKey('fear'));
  });

  it('settles bonuses of one type for one situation spelled two ways', () => {
    const char = Object.assign(new Character(), {feats: [
      new Feature({name: 'Brave', adjustments: {'savingThrowBonus[fear]': {value: 2, type: 'morale'}} as any}),
      new Feature({name: 'Braver', adjustments: {'savingThrowBonus[fear effects]': {value: 3, type: 'morale'}} as any}),
    ]});
    service.initializeCharacter(char);
    const variants = service.computeVariantsForPaths(['savingThrowBonus', 'saves.will'], 0, service.applied());
    expect(variants.length).toBe(1);
    expect(variants[0].name).toBe('fear');
    expect(variants[0].total).toBe(3);
  });

  it('refuses a piece of a sentence as a situation, and keeps a situation named alone', () => {
    expect(variantNameProblems('Mobility', ['ac[attacks of opportunity caused when you move out of]']).length).toBe(1);
    expect(variantNameProblems('Nightmare Fist', ['melee.*.damageBonus[a +4 bonus against opponents that are shaken]']).length).toBe(1);
    expect(variantNameProblems('Crane Style', ['ac[fighting defensively]']).length).toBe(1);
    expect(variantNameProblems('Mobility', [
      'ac[attacks of opportunity from movement]', 'saves.will[fear]', 'skills.heal.value[treat disease]',
      'stealth[concealment from dim light]', 'attackRollBonus[foes denied their Dex bonus]', 'cmb[{choice:maneuver}]',
    ])).toEqual([]);
  });
});
