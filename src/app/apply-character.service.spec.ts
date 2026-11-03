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

  describe('Step 1: selectors, variants, and auto-fail', () => {
    const loadExample = (): Character =>
      Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;

    it('expands skills.*.value and skills.@<ability>.value to ordinary skills and specialties, never families, with concrete adjustmentsMap keys', () => {
      const char = loadExample();
      char.feats.push(
        new Feature({
          name: 'Master Artisan',
          active: true,
          adjustments: { 'skills.craft.subSkills.pottery.value': 1 },
        }),
        new Feature({
          name: 'Jack of All Trades',
          active: true,
          adjustments: { 'skills.*.value': 2 },
        }),
        new Feature({
          name: 'Nimble',
          active: true,
          adjustments: { 'skills.@dex.value': 3 },
        }),
        new Feature({
          name: 'Scholar',
          active: true,
          adjustments: { 'skills.@int.value': 4 },
        })
      );

      service.initializeCharacter(char);
      const applied = service.applied();

      // Families themselves are never adjusted
      expect(applied.skills['craft'].value).toBe(0);
      expect(applied.skills['knowledge'].value).toBe(0);
      expect(applied.skills['perform'].value).toBe(0);
      expect(applied.skills['profession'].value).toBe(0);

      // Dex skill gets +2 (*) and +3 (@dex) = 5
      expect(applied.skills['acrobatics'].value).toBe(5);
      expect(applied.skills['fly'].value).toBe(5);

      // Int specialty (pottery) gets +1 (Master Artisan) + 2 (*) + 4 (@int) = 7
      expect(applied.skills['craft'].subSkills!['pottery'].value).toBe(7);
      // Knowledge specialty gets +2 (*) + 4 (@int) = 6
      expect(applied.skills['knowledge'].subSkills!['arcana'].value).toBe(6);

      // No adjustmentsMap key under skills. ever contains * or @
      const skillMapKeys = Object.keys(service.adjustmentsMap).filter(k => k.startsWith('skills.'));
      expect(skillMapKeys.length).toBeGreaterThan(0);
      for (const k of skillMapKeys) {
        expect(k.includes('*')).toBeFalse();
        expect(k.includes('@')).toBeFalse();
      }
      expect(service.adjustmentsMap['skills.craft.subSkills.pottery.value'].map(e => e.origin)).toEqual([
        'Master Artisan',
        'Jack of All Trades',
        'Scholar',
      ]);
    });

    it('expands skills.<family>.subSkills.*.value and enforces selector tie rule after non-selector adjustments', () => {
      const char = loadExample();
      // Class feature appears FIRST in engine order, using a selector
      char.classLevels[0].features.push(
        new Feature({
          name: 'Early Selector Competence',
          active: true,
          adjustments: {
            'skills.craft.subSkills.*.value': { value: 2, type: 'competence' },
            'skills.@wis.value[sight]': { value: 2, type: 'competence' },
          },
        })
      );
      // Equipped item appears LAST in engine order, without a selector
      char.inventory.push({
        id: 'goggles',
        name: 'Goggles',
        equipped: true,
        features: [
          new Feature({
            name: 'Late Concrete Competence',
            active: true,
            adjustments: {
              'skills.craft.subSkills.pottery.value': { value: 2, type: 'competence' },
              'skills.perception.value[sight]': { value: 2, type: 'competence' },
            },
          }),
        ],
      } as any);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.skills['craft'].subSkills!['pottery'].value).toBe(2);
      const potteryEntries = service.adjustmentsMap['skills.craft.subSkills.pottery.value'];
      expect(potteryEntries.find(e => e.origin === 'Late Concrete Competence')!.overwritten).toBeTrue();
      expect(potteryEntries.find(e => e.origin === 'Early Selector Competence')!.overwritten).toBeFalse();

      const perceptionSightEntries = service.adjustmentsMap['skills.perception.value'].filter(
        e => e.variant === 'sight'
      );
      expect(perceptionSightEntries.find(e => e.origin === 'Late Concrete Competence')!.overwritten).toBeTrue();
      expect(perceptionSightEntries.find(e => e.origin === 'Early Selector Competence')!.overwritten).toBeFalse();
    });

    it('handles Heroism variant example, trimming, stacking, and settling overwritten in applied()', () => {
      const char = loadExample();
      char.feats.push(
        new Feature({
          name: 'Heroism',
          active: true,
          adjustments: {
            'saves.will': { value: 1, type: 'morale' },
            'saves.will[fear]': { value: 2, type: 'morale' },
            'saves.will[ fear ]': 1,
          },
        })
      );
      // Note: exampleCharacter has Rage with saves.will {type: 'moral', value: 2} (spelled 'moral'); disable Rage to isolate Will = 0
      const charClean = new Character();
      charClean.feats.push(
        new Feature({
          name: 'Heroism',
          active: true,
          adjustments: {
            'saves.will': { value: 1, type: 'morale' },
            'saves.will[fear]': { value: 2, type: 'morale' },
            'saves.will[ fear ]': 1,
          },
        })
      );

      service.initializeCharacter(charClean);
      const applied = service.applied();

      expect(applied.saves.will).toBe(1);
      expect(service.adjustmentsMap['saves.will[fear]']).toBeUndefined();
      expect(service.adjustmentsMap['saves.will[ fear ]']).toBeUndefined();
      expect(service.adjustmentsMap['saves.will']).toEqual([
        { adjusting: 'saves.will', origin: 'Heroism', value: 1, type: 'morale', overwritten: false },
        { adjusting: 'saves.will', origin: 'Heroism', value: 2, type: 'morale', overwritten: false, variant: 'fear' },
        { adjusting: 'saves.will', origin: 'Heroism', value: 1, type: '', overwritten: false, variant: 'fear' },
      ] as any);

      const variants = service.computeVariantsForPaths(['savingThrowBonus', 'saves.will'], 1, applied);
      expect(variants.length).toBe(1);
      expect(variants[0].name).toBe('fear');
      expect(variants[0].total).toBe(3);
    });

    it('marks non-beating typed variant entries as overwritten when applied() is computed', () => {
      const char = new Character();
      char.feats.push(
        new Feature({
          name: 'Greater Heroism',
          active: true,
          adjustments: {
            'saves.will': { value: 4, type: 'morale' },
            'saves.will[fear]': { value: 2, type: 'morale' },
          },
        }),
        new Feature({
          name: 'Equal Fear Bonus',
          active: true,
          adjustments: {
            'saves.will[fear]': { value: 4, type: 'morale' },
          },
        })
      );

      service.initializeCharacter(char);
      const applied = service.applied();
      expect(applied.saves.will).toBe(4);

      const fearEntries = service.adjustmentsMap['saves.will'].filter(e => e.variant === 'fear');
      expect(fearEntries.length).toBe(2);
      expect(fearEntries.every(e => e.overwritten)).toBeTrue();

      const variants = service.computeVariantsForPaths(['savingThrowBonus', 'saves.will'], 4, applied);
      expect(variants[0].total).toBe(4);
    });

    it('propagates ac[...] variants to touchAc and flatFootedAc respecting ignored bonus types', () => {
      const char = new Character();
      char.feats.push(
        new Feature({
          name: 'Giant Dodger',
          active: true,
          adjustments: {
            'ac[giants]': { value: 4, type: 'dodge' },
            'ac[arrows]': { value: 4, type: 'shield' },
          },
        })
      );

      service.initializeCharacter(char);
      const applied = service.applied();
      expect(applied.ac).toBe(10);
      expect(applied.touchAc).toBe(10);
      expect(applied.flatFootedAc).toBe(10);

      expect(service.adjustmentsMap['ac'].map(e => e.variant)).toEqual(['giants', 'arrows']);
      expect(service.adjustmentsMap['touchAc'].map(e => e.variant)).toEqual(['giants']);
      expect(service.adjustmentsMap['flatFootedAc'].map(e => e.variant)).toEqual(['arrows']);
    });

    it('records auto-fail without modifying stat numbers or participating in stacking', () => {
      const char = new Character();
      char.feats.push(
        new Feature({
          name: 'Competence Boost',
          active: true,
          adjustments: {
            'skills.perception.value': { value: 5, type: 'competence' },
            'skills.perception.value[sight]': { value: 'auto-fail', type: 'competence' },
            'skills.stealth.value': { value: 'auto-fail', type: 'competence' },
            'skills.stealth.value[darkness]': 4,
          },
        }),
        new Feature({
          name: 'Smaller Competence',
          active: true,
          adjustments: {
            'skills.stealth.value': { value: 3, type: 'competence' },
          },
        })
      );

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.skills['perception'].value).toBe(5);
      expect(applied.skills['stealth'].value).toBe(3);

      const percVariants = service.computeVariantsForPaths(
        ['skillCheckBonus', 'skills.perception.value'],
        5,
        applied
      );
      expect(percVariants.find(v => v.name === 'sight')!.total).toBe('auto-fail');

      expect(service.hasBaseAutoFail(['skills.stealth.value'])).toBeTrue();
      const stealthVariants = service.computeVariantsForPaths(
        ['skillCheckBonus', 'skills.stealth.value'],
        'auto-fail',
        applied
      );
      expect(stealthVariants.find(v => v.name === 'darkness')!.total).toBe('auto-fail');
    });
  });

  describe('Step 2: skill families and classSkills', () => {
    it('loads updated example-character.json with knowledge subSkills, empty open families, and correct classSkills', () => {
      const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.skills['knowledge (nature)']).toBeUndefined();
      expect(applied.skills['professions']).toBeUndefined();
      expect(applied.skills['profession']).toBeDefined();
      expect(Object.keys(applied.skills['craft'].subSkills!)).toEqual([]);
      expect(Object.keys(applied.skills['perform'].subSkills!)).toEqual([]);
      expect(Object.keys(applied.skills['profession'].subSkills!)).toEqual([]);

      expect(applied.skills['knowledge'].subSkills!['nature'].classSkill).toBeTrue();
      expect(applied.skills['knowledge'].subSkills!['arcana'].classSkill).toBeFalse();
    });

    it('adds open-family specialties via adjustments (lowercased), ignores invalid knowledge specialties and unknown classSkills', () => {
      const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
      char.classLevels[0].classSkills.push('PERFORM (Sing)', 'Not A Real Skill', 'knowledge (mythology)');
      char.feats.push(
        new Feature({
          name: 'Craft & Perform',
          active: true,
          adjustments: {
            'skills.craft.subSkills.Pottery.value': 0,
            'skills.perform.subSkills.Sing.value': 2,
            'skills.perform.subSkills.dance.value': 0,
            'skills.knowledge.subSkills.mythology.value': 5,
          },
        })
      );

      service.initializeCharacter(char);
      let applied = service.applied();

      expect(applied.skills['knowledge'].subSkills!['mythology']).toBeUndefined();
      expect(applied.skills['craft'].subSkills!['pottery']).toEqual({
        name: 'pottery',
        ranks: 0,
        value: 0,
        classSkill: true,
        baseAbility: 'int',
      });
      expect(applied.skills['perform'].subSkills!['sing'].classSkill).toBeTrue();
      expect(applied.skills['perform'].subSkills!['sing'].value).toBe(2);
      expect(applied.skills['perform'].subSkills!['dance'].classSkill).toBeFalse();

      // Store ranks on raw character, then toggle the feature off and back on
      service.raw().skills['craft'].subSkills = {
        pottery: { name: 'pottery', ranks: 1, value: 0, classSkill: false, baseAbility: 'int' },
      };
      service.update();
      expect(service.applied().skills['craft'].subSkills!['pottery'].ranks).toBe(1);

      service.raw().feats[service.raw().feats.length - 1].active = false;
      service.update();
      applied = service.applied();
      expect(applied.skills['craft'].subSkills!['pottery']).toBeUndefined();
      expect(service.raw().skills['craft'].subSkills!['pottery'].ranks).toBe(1);
    });
  });

  describe('Step 4 & Step 5: conditionals, half speed, severity, and included conditions', () => {
    it('evaluates if and unless conditionals case-insensitively across all active feature locations', () => {
      const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
      char.feats.push(
        new Feature({
          name: 'Conditional Test',
          active: true,
          adjustments: {
            'saves.ref': { value: 2, if: ['darkvision', 'rage'] },
            'saves.fort': { value: 5, if: ['darkvision', 'missing feat'] },
            'denyDexBonus.ac': { value: true, unless: 'uncanny dodge' },
          },
        })
      );

      service.initializeCharacter(char);
      let applied = service.applied();
      expect(applied.saves.ref).toBe(2);
      expect(applied.saves.fort).toBe(2); // only Barbarian base +2, conditional +5 skipped
      expect(service.adjustmentsMap['saves.fort'].some(e => e.origin === 'Conditional Test')).toBeFalse();
      expect(applied.denyDexBonus.ac).toBeTrue();

      // Grant Uncanny Dodge via an equipped item's defensiveAbilities adjustment
      char.inventory.push({
        id: 'uncanny-ring',
        name: 'Ring',
        equipped: true,
        features: [
          new Feature({
            name: 'Grant Uncanny',
            active: true,
            adjustments: {
              defensiveAbilities: { name: 'Uncanny Dodge', adjustments: {} },
            },
          }),
        ],
      } as any);
      service.update();
      applied = service.applied();
      expect(applied.denyDexBonus.ac).toBeFalse();
      expect(service.adjustmentsMap['denyDexBonus.ac']).toBeUndefined();
    });

    it('halves speeds once after all adjustments and rounds down to a multiple of 5 ft', () => {
      const char = new Character();
      char.race.features.push(
        new Feature({
          name: 'Base Speed',
          active: true,
          adjustments: { 'speed.land': 25, 'speed.fly': 35 },
        })
      );
      char.feats.push(
        new Feature({
          name: 'Fleet',
          active: true,
          adjustments: { 'speed.land': 10 }, // 25 + 10 = 35 -> halved = 15
        })
      );
      char.conditions.push(
        new Feature({ name: 'Entangled', active: true, adjustments: { 'speed.*': 'half' } }),
        new Feature({ name: 'Exhausted', active: true, adjustments: { 'speed.*': 'half' } })
      );

      service.initializeCharacter(char);
      const applied = service.applied();
      expect(applied.speed.land).toBe(15);
      expect(applied.speed.fly).toBe(15);
      expect(applied.speed.swim).toBe(0);
      expect(service.adjustmentsMap['speed.land'].filter(e => e.value === 'half').length).toBe(2);
    });

    it('suppresses lower-severity and duplicate conditions while stacking Energy Drained', () => {
      const char = new Character();
      char.hp = 20;
      char.conditions.push(
        new Feature({
          name: 'Shaken',
          active: true,
          adjustments: { attackRollBonus: -2, savingThrowBonus: -2, skillCheckBonus: -2, abilityCheckBonus: -2 },
        }),
        new Feature({
          name: 'Panicked',
          active: true,
          adjustments: { savingThrowBonus: -2, skillCheckBonus: -2, abilityCheckBonus: -2 },
        }),
        new Feature({
          name: 'Dazzled',
          active: true,
          adjustments: { attackRollBonus: -1 },
        }),
        new Feature({
          name: 'Dazzled',
          active: true,
          adjustments: { attackRollBonus: -1 },
        }),
        new Feature({
          name: 'Energy Drained',
          active: true,
          adjustments: {
            attackRollBonus: -1,
            cmb: -1,
            cmd: -1,
            savingThrowBonus: -1,
            skillCheckBonus: -1,
            abilityCheckBonus: -1,
            hp: -5,
          },
        }),
        new Feature({
          name: 'Energy Drained',
          active: true,
          adjustments: {
            attackRollBonus: -1,
            cmb: -1,
            cmd: -1,
            savingThrowBonus: -1,
            skillCheckBonus: -1,
            abilityCheckBonus: -1,
            hp: -5,
          },
        })
      );
      // Conditional adjustment checking suppressed 'Shaken' must NOT trigger
      char.feats.push(
        new Feature({
          name: 'If Shaken Check',
          active: true,
          adjustments: { bab: { value: 9, if: 'Shaken' } },
        })
      );

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(service.isConditionSuppressed(0)).toBeTrue(); // Shaken suppressed by Panicked
      expect(service.isConditionSuppressed(1)).toBeFalse(); // Panicked applies
      expect(service.isConditionSuppressed(2)).toBeFalse(); // First Dazzled applies
      expect(service.isConditionSuppressed(3)).toBeTrue(); // Duplicate Dazzled suppressed
      expect(service.isConditionSuppressed(4)).toBeFalse(); // First Energy Drained applies
      expect(service.isConditionSuppressed(5)).toBeFalse(); // Second Energy Drained applies

      // Shaken's -2 attackRollBonus is suppressed; 1x Dazzled (-1) + 2x Energy Drained (-2) = -3
      expect(applied.attackRollBonus).toBe(-3);
      // Panicked (-2) + 2x Energy Drained (-2) = -4
      expect(applied.savingThrowBonus).toBe(-4);
      expect(applied.abilityCheckBonus).toBe(-4);
      expect(applied.hp).toBe(10); // 20 - 10
      expect(applied.bab).toBe(0); // Shaken did not count for if/unless
      expect(applied.conditions.length).toBe(6); // Suppressed conditions remain on character
    });

    it('includes transitive conditions (Dying -> Unconscious -> Helpless) once without adding to saved conditions', () => {
      const char = new Character();
      char.abilityScores.dex = 16;
      char.conditions.push(
        new Feature({ id: 'Dying', name: 'Dying', active: true, adjustments: {} }),
        new Feature({ id: 'Stable', name: 'Stable', active: true, adjustments: {} })
      );
      char.feats.push(
        new Feature({
          name: 'Helpless Detector',
          active: true,
          adjustments: {
            'saves.fort': { value: 3, if: ['Unconscious', 'Helpless'] },
          },
        })
      );

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.abilityScores.dex).toBe(0);
      expect(applied.saves.fort).toBe(3);
      expect(service.raw().conditions.map(c => c.name)).toEqual(['Dying', 'Stable']);
      expect(applied.conditions.map(c => c.name)).toEqual(['Dying', 'Stable']);
    });
  });
});
