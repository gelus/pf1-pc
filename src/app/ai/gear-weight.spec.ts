import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { createItems } from './builders';
import { checkCreatedCharacter } from './character-check';
import { sizedWeight } from './gear-prices';

// the weight of what the AI buys: by the piece, for the character's size, and the load it makes told
describe('gear weight', () => {
  it('weighs ammunition by the piece and weapons and armor for the character\'s size', () => {
    expect(sizedWeight('Crossbow bolts', 'other', 1, 10, 4).weight).toBe(0.1);
    expect(sizedWeight('Arrows', 'other', 3, 20, 4).weight).toBe(0.15);
    // a weight already per piece is left as it is
    expect(sizedWeight('Arrows', 'other', 0.15, 20, 4)).toEqual({weight: 0.15, notes: []});
    expect(sizedWeight('Light crossbow', 'weapon', 4, 1, 3).weight).toBe(2);
    expect(sizedWeight('Hide armor', 'armor', 25, 1, 5).weight).toBe(50);
    expect(sizedWeight('Bedroll', 'other', 5, 1, 3).weight).toBe(5);
    expect(sizedWeight('Longsword', 'weapon', 4, 1, 4)).toEqual({weight: 4, notes: []});
  });

  it('equips what the AI marks equipped, and tells the load a kit makes', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ApplyCharacterService);
    const char = new Character();
    char.abilityScores = {str: 7, dex: 14, con: 12, int: 10, wis: 10, cha: 10};
    service.initializeCharacter(JSON.parse(JSON.stringify(char)));
    const result = createItems(service, {based_on: 'own knowledge', items: JSON.stringify([
      {name: 'Spear', type: 'weapon', cost_gp: 2, weight: 6, damage: '1d8', critical: 'x3', attack_kind: 'melee', handedness: 'two-handed', equipped: true},
      {name: 'Crossbow bolts', type: 'other', cost_gp: 0.1, weight: 1, quantity: 10},
      {name: 'Bedroll', type: 'other', cost_gp: 0.1, weight: 25},
    ])}) as any;
    expect(service.raw().inventory.find(i => i.name === 'Spear')!.equipped).toBeTrue();
    expect(result.weightCorrected.join(' ')).toContain('1 lb. is the weight of the bundle of 10, 0.1 lb. each');
    // 6 + 1 + 25 = 32 lbs. for Str 7: a medium load
    expect(result.load).toContain('32 lbs. carried, a medium load');
    expect(result.tellThePlayer).toContain('max Dex bonus +3');
    expect(checkCreatedCharacter(service).warnings.join(' ')).toContain('carries 32 lbs., a medium load');
  });
});
