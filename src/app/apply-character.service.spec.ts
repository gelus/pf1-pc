import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from './apply-character.service';
import {Character} from './utils/character.class';
import {Feature} from './interfaces/character.interface';
import {MeleeAttack} from './utils/attack.class';

describe('ApplyCharacterService', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('should apply to ALL melee attacks on the appliedChar, not the raw char', () => {
    const char = new Character();
    const attack1 = new MeleeAttack();
    attack1.name = 'Sword';
    attack1.toHitBonus = 5;
    
    const attack2 = new MeleeAttack();
    attack2.name = 'Dagger';
    attack2.toHitBonus = 2;

    char.melee.push(attack1, attack2);

    const feature: Feature = {
      id: '1',
      name: 'Weapon Focus',
      description: '',
      active: true,
      adjustments: {
        'melee.*.toHitBonus': 1
      }
    };

    char.feats.push(feature);

    service.initializeCharacter(char);
    const applied = service.applied();

    // Verify raw character remains unchanged
    expect(char.melee[0].toHitBonus).toBe(5);
    expect(char.melee[1].toHitBonus).toBe(2);

    // Verify applied character gets the bonus on all melee attacks
    expect(applied.melee[0].toHitBonus).toBe(6);
    expect(applied.melee[1].toHitBonus).toBe(3);
  }); // close test
});
