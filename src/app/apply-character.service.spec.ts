import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from './apply-character.service';
import {Character} from './utils/character.class';
import {Feature} from './interfaces/character.interface';

describe('ApplyCharacterService', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('should apply to ALL melee attacks on the appliedChar, not the raw char', () => {
    const char = new Character();

    char.inventory.push({
      "id": "one", "description": "Big Axe", "equipped": true,
      "features": [
        {
          "id": "ft1-id", "name": "Big Axe", "description": "My Big Axe Attack",
          "adjustments": {
            "melee": {
              "type": "iterative", "name": "Big Axe", "damage": "1d12",
              "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
              "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "S" ]
            }
          }
        }
      ],
    } as any);

    char.conditions.push({
      "id": "two", "name": "Punch", "description": "A new Feature",
      "adjustments": {
        "melee": {
          "type": "iterative", "name": "Punch", "damage": "1d12",
          "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
          "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "B" ]
        }
      },
      "active": true
    } as any);

    char.feats.push(new Feature({
      id: 'feat1',
      name: 'Weapon Focus',
      active: true,
      adjustments: {
        'melee.*.toHitBonus': 1,
        'melee.*.crit': -1,
      } as any
    }));

    service.initializeCharacter(char);
    const raw = service.raw();
    const applied = service.applied();

    // Verify raw character was not modified
    expect(raw.melee.length).toBe(0);
    expect((raw.inventory[0].features[0].adjustments.melee as any).toHitBonus).toBe(0, 'raw attack from item in inventory, toHitBonus should be 0');
    expect((raw.inventory[0].features[0].adjustments.melee as any).crit).toBe(20, 'raw attack from item in inventory, crit should be 20');
    expect((raw.conditions[0].adjustments.melee as any).toHitBonus).toBe(0, 'raw attack from condition feature, toHitBonus should be 0');
    expect((raw.conditions[0].adjustments.melee as any).crit).toBe(20, 'raw attack from condition feature, crit should be 20');

    // Verify applied character has the new attack with adjustments
    expect(applied.melee.length).toBe(2);

    expect(applied.melee[1].name).toBe('Big Axe');
    expect(applied.melee[1].toHitBonus).toBe(1);
    expect(applied.melee[1].crit).toBe(19);

    expect(applied.melee[0].name).toBe('Punch');
    expect(applied.melee[0].toHitBonus).toBe(1);
    expect(applied.melee[0].crit).toBe(19);

  }); // close test

  it('should apply to ALL ranged attacks on the appliedChar, not the raw char', () => {
    const char = new Character();

    char.inventory.push({
      "id": "one", "description": "Big Axe", "equipped": true,
      "features": [
        {
          "id": "ft1-id", "name": "Big Axe", "description": "My Big Axe Attack",
          "adjustments": {
            "ranged": {
              "type": "iterative", "name": "Big Axe", "damage": "1d12",
              "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
              "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "S" ]
            }
          }
        }
      ],
    } as any);

    char.conditions.push({
      "id": "two", "name": "Punch", "description": "A new Feature",
      "adjustments": {
        "ranged": {
          "type": "iterative", "name": "Punch", "damage": "1d12",
          "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
          "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "B" ]
        }
      },
      "active": true
    } as any);

    char.feats.push(new Feature({
      id: 'feat1',
      name: 'Weapon Focus',
      active: true,
      adjustments: {
        'ranged.*.toHitBonus': 1,
        'ranged.*.crit': -1,
      } as any
    }));

    service.initializeCharacter(char);
    const raw = service.raw();
    const applied = service.applied();

    // Verify raw character was not modified
    expect(raw.melee.length).toBe(0);
    expect((raw.inventory[0].features[0].adjustments.ranged as any).toHitBonus).toBe(0, 'raw attack from item in inventory, toHitBonus should be 0');
    expect((raw.inventory[0].features[0].adjustments.ranged as any).crit).toBe(20, 'raw attack from item in inventory, crit should be 20');
    expect((raw.conditions[0].adjustments.ranged as any).toHitBonus).toBe(0, 'raw attack from condition feature, toHitBonus should be 0');
    expect((raw.conditions[0].adjustments.ranged as any).crit).toBe(20, 'raw attack from condition feature, crit should be 20');

    // Verify applied character has the new attack with adjustments
    expect(applied.ranged.length).toBe(2);

    expect(applied.ranged[1].name).toBe('Big Axe');
    expect(applied.ranged[1].toHitBonus).toBe(1);
    expect(applied.ranged[1].crit).toBe(19);

    expect(applied.ranged[0].name).toBe('Punch');
    expect(applied.ranged[0].toHitBonus).toBe(1);
    expect(applied.ranged[0].crit).toBe(19);

  }); // close test

  it('should apply melee and range to the correct fields', () => {
    const char = new Character();

    char.inventory.push({
      "id": "one", "description": "Big Axe", "equipped": true,
      "features": [
        {
          "id": "ft1-id", "name": "Big Axe", "description": "My Big Axe Attack",
          "adjustments": {
            "melee": {
              "type": "iterative", "name": "Big Axe", "damage": "1d12",
              "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
              "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "S" ]
            }
          }
        }
      ],
    } as any,
      {
      "id": "r1", "description": "Big Bow", "equipped": true,
      "features": [
        {
          "id": "ft1-id", "name": "Big Bow", "description": "My Bow Attack",
          "adjustments": {
            "ranged": {
              "type": "iterative", "name": "Big Bow", "damage": "1d12",
              "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
              "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "S" ]
            }
          }
        }
      ],
    } as any);

    char.conditions.push({
      "id": "two", "name": "Punch", "description": "A new Feature",
      "adjustments": {
        "melee": {
          "type": "iterative", "name": "Punch", "damage": "1d12",
          "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
          "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "B" ]
        }
      },
      "active": true
    } as any,
    {
      "id": "two", "name": "Thrown Rock", "description": "A new Feature",
      "adjustments": {
        "ranged": {
          "type": "iterative", "name": "Thrown Rock", "damage": "1d12",
          "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
          "crit": 20, "critMultiplier": 2, "range": 0, "damageType": [ "B" ]
        }
      },
      "active": true
    } as any);

    char.feats.push(new Feature({
      id: 'feat1',
      name: 'Weapon Focus',
      active: true,
      adjustments: {
        'melee.*.toHitBonus': 1,
      } as any
    }));
    char.feats.push(new Feature({
      id: 'feat2',
      name: 'Range Focus',
      active: true,
      adjustments: {
        'ranged.*.crit': -1,
      } as any
    }));

    service.initializeCharacter(char);
    const raw = service.raw();
    const applied = service.applied();

    // Verify raw character was not modified
    expect(raw.melee.length).toBe(0);
    expect((raw.inventory[0].features[0].adjustments.melee as any).toHitBonus).toBe(0, 'raw attack from item in inventory, toHitBonus should be 0');
    expect((raw.inventory[0].features[0].adjustments.melee as any).crit).toBe(20, 'raw attack from item in inventory, crit should be 20');
    expect((raw.inventory[1].features[0].adjustments.ranged as any).toHitBonus).toBe(0, 'raw range attack from item in inventory, toHitBonus should be 0');
    expect((raw.inventory[1].features[0].adjustments.ranged as any).crit).toBe(20, 'raw range attack from item in inventory, crit should be 20');
    expect((raw.conditions[0].adjustments.melee as any).toHitBonus).toBe(0, 'raw attack from condition feature, toHitBonus should be 0');
    expect((raw.conditions[0].adjustments.melee as any).crit).toBe(20, 'raw attack from condition feature, crit should be 20');
    expect((raw.conditions[1].adjustments.ranged as any).toHitBonus).toBe(0, 'raw range attack from condition feature, toHitBonus should be 0');
    expect((raw.conditions[1].adjustments.ranged as any).crit).toBe(20, 'raw range attack from condition feature, crit should be 20');

    // Verify applied character has the new attack with adjustments
    expect(applied.melee.length).toBe(2);

    expect(applied.melee[1].name).toBe('Big Axe');
    expect(applied.melee[1].toHitBonus).toBe(1);
    expect(applied.melee[1].crit).toBe(20);

    expect(applied.melee[0].name).toBe('Punch');
    expect(applied.melee[0].toHitBonus).toBe(1);
    expect(applied.melee[0].crit).toBe(20);

    expect(applied.ranged[1].name).toBe('Big Bow');
    expect(applied.ranged[1].toHitBonus).toBe(0);
    expect(applied.ranged[1].crit).toBe(19);

    expect(applied.ranged[0].name).toBe('Thrown Rock');
    expect(applied.ranged[0].toHitBonus).toBe(0);
    expect(applied.ranged[0].crit).toBe(19);

  }); // close test

  describe('touch and flat-footed AC', () => {

    const applyChar = (mutate: (char: Character) => void = () => {}): Character => {
      const char = new Character();
      mutate(char);
      service.initializeCharacter(char);
      return service.applied();
    };

    const feature = (name: string, adjustments: any): Feature => new Feature({name, active: true, adjustments});

    it('should default both to the base AC of an unadjusted character', () => {
      const applied = applyChar();

      expect(applied.touchAc).toBe(10);
      expect(applied.flatFootedAc).toBe(10);
    });

    it('should drop armor, shield and natural armor bonuses from touch AC but keep them in flat-footed AC', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
        feature('Heavy Shield', {ac: {value: 2, type: 'shield'}}),
        feature('Scales', {ac: {value: 3, type: 'natural armor'}}),
      ));

      expect(applied.ac).toBe(21);
      expect(applied.touchAc).toBe(10);
      expect(applied.flatFootedAc).toBe(21);
    });

    it('should keep deflection and other bonuses in touch AC', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Ring of Protection', {ac: {value: 2, type: 'deflection'}}),
        feature('Untyped Blessing', {ac: 1}),
      ));

      expect(applied.touchAc).toBe(13);
      expect(applied.flatFootedAc).toBe(13);
    });

    it('should drop dodge bonuses from flat-footed AC but keep them in touch AC', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Dodge', {ac: {value: 1, type: 'dodge'}}),
      ));

      expect(applied.ac).toBe(11);
      expect(applied.touchAc).toBe(11);
      expect(applied.flatFootedAc).toBe(10);
    });

    it('should include a positive dex bonus in touch AC and drop it from flat-footed AC', () => {
      const applied = applyChar(char => char.abilityScores.dex = 16);

      expect(applied.touchAc).toBe(13);
      expect(applied.flatFootedAc).toBe(10);
    });

    it('should keep a negative dex modifier in both touch and flat-footed AC', () => {
      const applied = applyChar(char => char.abilityScores.dex = 6);

      expect(applied.touchAc).toBe(8);
      expect(applied.flatFootedAc).toBe(8);
    });

    it('should cap the dex bonus of touch AC by the max dex bonus of worn armor', () => {
      const applied = applyChar(char => {
        char.abilityScores.dex = 18;
        char.feats.push(feature('Breastplate', {ac: {value: 6, type: 'armor'}, maxDexBonus: 3}));
      });

      expect(applied.touchAc).toBe(13);
      expect(applied.flatFootedAc).toBe(16);
    });

    it('should not count an overwritten same type bonus', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
        feature('Padded Armor', {ac: {value: 1, type: 'armor'}}),
      ));

      expect(applied.ac).toBe(16);
      expect(applied.touchAc).toBe(10);
    });

    it('should account for adjustments that resolve after the ability mods are known', () => {
      const applied = applyChar(char => {
        char.abilityScores.dex = 14;
        // the Flat-Footed condition removes the dex bonus from AC with a calculated string
        char.conditions.push(feature('Flat-Footed', {ac: '-{mod:abilityScores.dex}'}));
      });

      expect(applied.ac).toBe(8);
      expect(applied.touchAc).toBe(10);
      expect(applied.flatFootedAc).toBe(8);
    });

    it('should expose the breakdown used to build the derived ACs', () => {
      applyChar(char => {
        char.abilityScores.dex = 14;
        char.feats.push(
          feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
          feature('Dodge', {ac: {value: 1, type: 'dodge'}}),
        );
      });

      expect(service.acBreakdown).toEqual({dex: 2, touchIgnored: 6, flatFootedDex: 0, flatFootedIgnored: 1});
    });

    it('should add adjustments made directly to touchAc and flatFootedAc', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Weirdly Specific Feat', {touchAc: 2, flatFootedAc: 3}),
      ));

      expect(applied.touchAc).toBe(12);
      expect(applied.flatFootedAc).toBe(13);
    });

  }); // close describe
});
