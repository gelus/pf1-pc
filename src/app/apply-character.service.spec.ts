import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from './apply-character.service';
import {Character} from './utils/character.class';
import {Feature, Spell} from './interfaces/character.interface';
import exampleCharacter from './example-character.json';

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

    it('should leave the dex modifier of the character to the sheet, just like the AC stat does', () => {
      const applied = applyChar(char => char.abilityScores.dex = 16);

      // the dex modifier is not an adjustment, the stat display adds it to the AC stats it applies to
      expect(applied.ac).toBe(10);
      expect(applied.touchAc).toBe(10);
      expect(applied.flatFootedAc).toBe(10);
    });

    it('should drop a dex bonus from flat-footed AC but keep it in touch AC', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Cats Grace', {ac: {value: 2, type: 'dex'}}),
      ));

      expect(applied.ac).toBe(12);
      expect(applied.touchAc).toBe(12);
      expect(applied.flatFootedAc).toBe(10);
    });

    it('should keep a dex penalty in both touch and flat-footed AC', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Clumsy', {ac: {value: -2, type: 'dex'}}),
      ));

      expect(applied.ac).toBe(8);
      expect(applied.touchAc).toBe(8);
      expect(applied.flatFootedAc).toBe(8);
    });

    it('should not count an overwritten same type bonus', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
        feature('Padded Armor', {ac: {value: 1, type: 'armor'}}),
      ));

      expect(applied.ac).toBe(16);
      expect(applied.touchAc).toBe(10);
    });

    it('should override a smaller same type bonus applied earlier from another source', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Padded Armor', {ac: {value: 1, type: 'armor'}}),
        feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
      ));

      expect(applied.ac).toBe(16);
      expect(applied.touchAc).toBe(10);

      const armorAdjustments = service.adjustmentsMap['ac']
        .map(adjustment => [adjustment.origin, adjustment.overwritten]);
      expect(armorAdjustments).toEqual([['Padded Armor', true], ['Chainmail', false]]);
    });

    it('should account for adjustments that resolve after the ability mods are known', () => {
      const applied = applyChar(char => {
        char.abilityScores.dex = 14;
        // the Flat-Footed condition removes the dex bonus from AC with a calculated string
        char.conditions.push(feature('Flat-Footed', {ac: '-{mod:abilityScores.dex}'}));
      });

      expect(applied.ac).toBe(8);
      expect(applied.touchAc).toBe(8);
      expect(applied.flatFootedAc).toBe(8);
    });

    it('should track what adjusts the derived ACs in the adjustments map', () => {
      applyChar(char => char.feats.push(
        feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
        feature('Dodge', {ac: {value: 1, type: 'dodge'}}),
      ));

      const adjustmentsOf = (stat: string) =>
        (service.adjustmentsMap[stat] ?? []).map(adjustment => [adjustment.value, adjustment.type, adjustment.origin]);

      expect(adjustmentsOf('ac')).toEqual([[6, 'armor', 'Chainmail'], [1, 'dodge', 'Dodge']]);
      expect(adjustmentsOf('touchAc')).toEqual([[1, 'dodge', 'Dodge']]);
      expect(adjustmentsOf('flatFootedAc')).toEqual([[6, 'armor', 'Chainmail']]);
    });

    it('should add adjustments made directly to touchAc and flatFootedAc', () => {
      const applied = applyChar(char => char.feats.push(
        feature('Weirdly Specific Feat', {touchAc: 2, flatFootedAc: 3}),
      ));

      expect(applied.touchAc).toBe(12);
      expect(applied.flatFootedAc).toBe(13);
    });

  }); // close describe

  describe('spell casting', () => {
    const spell = (name: string, adjustments?: any): Spell => ({
      name,
      school: 'Abjuration',
      castingTime: '1 standard action',
      components: ['V', 'S'],
      range: 'Personal',
      target: 'You',
      duration: '1 minute/level',
      savingThrow: 'None',
      spellResistance: false,
      description: `${name} description`,
      adjustments,
    });

    const casterAdjustment = (casterLevel: number, current: number, spells: Spell[]) => ({
      spells: {
        wizard: {
          name: 'Wizard',
          ability: 'int',
          casterLevel,
          concentration: casterLevel,
          spells: [{perDay: {total: current, current}, spells}],
        },
      },
    });

    const spellCharacter = (): Character => {
      const char = new Character();
      char.abilityScores.int = 16;
      char.classLevels.push(
        {name: 'Wizard', level: 1, hitDice: 6, rolledHp: 0, classSkills: [], skillRanks: 2, startingWealth: 70,
          features: [new Feature({name: 'Wizard spellcasting 1', adjustments: casterAdjustment(1, 2, [spell('Shield', {ac: {value: 4, type: 'shield'}})])})]},
        {name: 'Wizard', level: 2, hitDice: 6, rolledHp: 4, classSkills: [], skillRanks: 2, startingWealth: 0,
          features: [new Feature({name: 'Wizard spellcasting 2', adjustments: casterAdjustment(1, 1, [spell('Mage Hand')])})]},
      );
      char.feats.push(new Feature({
        name: 'Bonus spell',
        adjustments: {'spells.wizard.spells.0.spells': [spell('Light')]},
      }));
      return char;
    };

    it('merges class-level and feature adjustments by origin and spell level', () => {
      const char = spellCharacter();
      service.initializeCharacter(char);

      const wizard = service.applied().spells.wizard;
      expect(wizard.name).toBe('Wizard');
      expect(wizard.ability).toBe('int');
      expect(wizard.casterLevel).toBe(2);
      expect(wizard.concentration).toBe(2);
      expect(wizard.spells[0].perDay).toEqual({total: 3, current: 3});
      expect(wizard.spells[0].spells.map(({name}) => name)).toEqual(['Shield', 'Mage Hand', 'Light']);

      expect(service.raw().spells).toEqual({});
      expect((char.classLevels[0].features[0].adjustments.spells as any).wizard.spells[0].perDay.current).toBe(2);
    });

    it('consumes and resets the raw charge sources behind an applied spell level', () => {
      service.initializeCharacter(spellCharacter());

      expect(service.consumeSpellLevel('spells', 'wizard', 0)).toBeTrue();
      expect(service.applied().spells.wizard.spells[0].perDay.current).toBe(2);

      service.resetSpellLevel('spells', 'wizard', 0);
      expect(service.applied().spells.wizard.spells[0].perDay.current).toBe(3);
    });

    it('casts a spell on self as an active condition after spending its charge', () => {
      service.initializeCharacter(spellCharacter());
      const shield = service.applied().spells.wizard.spells[0].spells[0];

      expect(service.castSpell('spells', 'wizard', 0, shield, true)).toBeTrue();

      expect(service.raw().conditions.length).toBe(1);
      expect(service.raw().conditions[0].name).toBe('Shield');
      expect(service.raw().conditions[0].active).toBeTrue();
      expect(service.applied().ac).toBe(14);
      expect(service.applied().spells.wizard.spells[0].perDay.current).toBe(2);
    });

    it('creates, edits and deletes spells while preserving a feature-defined caster level', () => {
      service.initializeCharacter(spellCharacter());
      const added = spell('Read Magic');

      service.saveSpell('spells', 'wizard', 0, added, service.applied().spells.wizard);
      expect(service.applied().spells.wizard.casterLevel).toBe(2);
      expect(service.applied().spells.wizard.spells[0].spells.some(({name}) => name === 'Read Magic')).toBeTrue();

      const edited = {...added, name: 'Read Arcane Script'};
      service.saveSpell('spells', 'wizard', 0, edited, {}, {origin: 'wizard', levelIndex: 0, name: 'Read Magic'});
      expect(service.applied().spells.wizard.spells[0].spells.some(({name}) => name === 'Read Arcane Script')).toBeTrue();

      service.deleteSpell('spells', 'wizard', 0, 'Read Arcane Script');
      expect(service.applied().spells.wizard.spells[0].spells.some(({name}) => name === 'Read Arcane Script')).toBeFalse();
    });

    it('processes the example character class spells and racial spell-like abilities', () => {
      const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
      service.initializeCharacter(char);

      expect(service.applied().spells.barbarian.spells[0].spells[0].name).toBe('Detect Magic');
      expect(service.applied().spells.barbarian.spells[1].perDay).toEqual({
        total: 1,
        current: 1,
        label: '1st-level spells per day',
      });
      expect(service.applied().spellLikeAbilities['half-orc'].spells[0].spells[0].name).toBe('Touch of Fatigue');
    });
  });
});
