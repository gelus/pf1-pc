import { TestBed } from '@angular/core/testing';
import { ApplyCharacterService } from '../src/app/apply-character.service';
import { Character } from '../src/app/utils/character.class';
import { ConditionsService } from '../src/app/conditions.service';
import { AttackComponent } from '../src/app/attack/attack.component';

const loadCharacter = (json: string): Character =>
  Object.assign(new Character(), JSON.parse(json));

const asJson = <T>(value: unknown): T => JSON.parse(JSON.stringify(value));

describe('Roll Type Adjustments', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AttackComponent] });
    service = TestBed.inject(ApplyCharacterService);
  });

  describe('Character class new properties', () => {
    it('should have attackRollBonus property defaulting to 0', () => {
      const char = loadCharacter('{}');
      expect((char as any).attackRollBonus).toBe(0);
    });

    it('should have meleeAttackRollBonus property defaulting to 0', () => {
      const char = loadCharacter('{}');
      expect((char as any).meleeAttackRollBonus).toBe(0);
    });

    it('should have rangedAttackRollBonus property defaulting to 0', () => {
      const char = loadCharacter('{}');
      expect((char as any).rangedAttackRollBonus).toBe(0);
    });

    it('should have savingThrowBonus property defaulting to 0', () => {
      const char = loadCharacter('{}');
      expect((char as any).savingThrowBonus).toBe(0);
    });

    it('should have skillCheckBonus property defaulting to 0', () => {
      const char = loadCharacter('{}');
      expect((char as any).skillCheckBonus).toBe(0);
    });
  });

  describe('Adjustment system integration', () => {
    it('should apply attackRollBonus via adjustment and track in adjustmentsMap', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "test-condition",
              "name": "Test Condition",
              "active": true,
              "adjustments": { "attackRollBonus": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-2);
      expect(service.adjustmentsMap['attackRollBonus']).toBeDefined();
      expect(service.adjustmentsMap['attackRollBonus'].length).toBe(1);
      expect(service.adjustmentsMap['attackRollBonus'][0].origin).toBe('Test Condition');
    });

    it('should apply meleeAttackRollBonus via adjustment', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "prone-test",
              "name": "Prone",
              "active": true,
              "adjustments": { "meleeAttackRollBonus": -4 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).meleeAttackRollBonus).toBe(-4);
    });

    it('should apply rangedAttackRollBonus via adjustment', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "ranged-penalty",
              "name": "Ranged Penalty",
              "active": true,
              "adjustments": { "rangedAttackRollBonus": -3 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).rangedAttackRollBonus).toBe(-3);
    });

    it('should apply savingThrowBonus via adjustment', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "save-penalty",
              "name": "Save Penalty",
              "active": true,
              "adjustments": { "savingThrowBonus": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).savingThrowBonus).toBe(-2);
    });

    it('should apply skillCheckBonus via adjustment', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "skill-penalty",
              "name": "Skill Penalty",
              "active": true,
              "adjustments": { "skillCheckBonus": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).skillCheckBonus).toBe(-2);
    });

    it('should stack multiple untyped adjustments to attackRollBonus additively', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "condition-1",
              "name": "Condition One",
              "active": true,
              "adjustments": { "attackRollBonus": -2 }
            },
            {
              "id": "condition-2",
              "name": "Condition Two",
              "active": true,
              "adjustments": { "attackRollBonus": -1 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-3);
    });

    it('should not apply adjustments from inactive features', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "inactive-condition",
              "name": "Inactive",
              "active": false,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(0);
      expect((applied as any).savingThrowBonus).toBe(0);
      expect((applied as any).skillCheckBonus).toBe(0);
    });

    it('should not modify the raw character when applying roll bonuses', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "test-condition",
              "name": "Test Condition",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const raw = service.raw();
      const applied = service.applied();

      expect((raw as any).attackRollBonus).toBe(0);
      expect((raw as any).savingThrowBonus).toBe(0);
      expect((raw as any).skillCheckBonus).toBe(0);
      expect((applied as any).attackRollBonus).toBe(-2);
      expect((applied as any).savingThrowBonus).toBe(-2);
      expect((applied as any).skillCheckBonus).toBe(-2);
    });
  });

  describe('Saving throw bonus application in stat-display', () => {
    it('should add savingThrowBonus to fort save value', () => {
      const char = loadCharacter(`
        {
          "saves": { "fort": 3, "ref": 2, "will": 1, "conditional": "" },
          "conditions": [
            {
              "id": "frightened",
              "name": "Frightened",
              "active": true,
              "adjustments": { "savingThrowBonus": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.saves.fort).toBe(3);
      expect((applied as any).savingThrowBonus).toBe(-2);
    });

    it('should add savingThrowBonus to ref save value', () => {
      const char = loadCharacter(`
        {
          "saves": { "fort": 3, "ref": 5, "will": 1, "conditional": "" },
          "conditions": [
            {
              "id": "shaken",
              "name": "Shaken",
              "active": true,
              "adjustments": { "savingThrowBonus": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.saves.ref).toBe(5);
      expect((applied as any).savingThrowBonus).toBe(-2);
    });

    it('should add savingThrowBonus to will save value', () => {
      const char = loadCharacter(`
        {
          "saves": { "fort": 3, "ref": 2, "will": 4, "conditional": "" },
          "conditions": [
            {
              "id": "sickened",
              "name": "Sickened",
              "active": true,
              "adjustments": { "savingThrowBonus": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.saves.will).toBe(4);
      expect((applied as any).savingThrowBonus).toBe(-2);
    });
  });

  describe('Skill check bonus application in stat-display', () => {
    it('should apply skillCheckBonus adjustment to character', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "frightened",
              "name": "Frightened",
              "active": true,
              "adjustments": { "skillCheckBonus": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).skillCheckBonus).toBe(-2);
    });
  });

  describe('Attack roll bonus application', () => {
    it('should apply attackRollBonus to character with melee attacks', () => {
      const char = loadCharacter(`
        {
          "inventory": [
            {
              "id": "sword",
              "description": "Longsword",
              "equipped": true,
              "features": [
                {
                  "id": "sword-atk",
                  "name": "Longsword",
                  "adjustments": {
                    "melee": {
                      "type": "iterative", "name": "Longsword", "damage": "1d8",
                      "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 19, "critMultiplier": 2, "range": 0, "damageType": ["S"]
                    }
                  }
                }
              ]
            }
          ],
          "conditions": [
            {
              "id": "dazzled",
              "name": "Dazzled",
              "active": true,
              "adjustments": { "attackRollBonus": -1 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.melee.length).toBe(1);
      expect(applied.melee[0].name).toBe('Longsword');
      expect((applied as any).attackRollBonus).toBe(-1);
    });

    it('should apply attackRollBonus to character with ranged attacks', () => {
      const char = loadCharacter(`
        {
          "inventory": [
            {
              "id": "bow",
              "description": "Longbow",
              "equipped": true,
              "features": [
                {
                  "id": "bow-atk",
                  "name": "Longbow",
                  "adjustments": {
                    "ranged": {
                      "type": "iterative", "name": "Longbow", "damage": "1d8",
                      "toHitAbility": "dex", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 20, "critMultiplier": 3, "range": 100, "damageType": ["P"]
                    }
                  }
                }
              ]
            }
          ],
          "conditions": [
            {
              "id": "dazzled",
              "name": "Dazzled",
              "active": true,
              "adjustments": { "attackRollBonus": -1 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.ranged.length).toBe(1);
      expect(applied.ranged[0].name).toBe('Longbow');
      expect((applied as any).attackRollBonus).toBe(-1);
    });

    it('should apply meleeAttackRollBonus only to melee, not ranged', () => {
      const char = loadCharacter(`
        {
          "inventory": [
            {
              "id": "sword",
              "description": "Longsword",
              "equipped": true,
              "features": [
                {
                  "id": "sword-atk",
                  "name": "Longsword",
                  "adjustments": {
                    "melee": {
                      "type": "iterative", "name": "Longsword", "damage": "1d8",
                      "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 19, "critMultiplier": 2, "range": 0, "damageType": ["S"]
                    }
                  }
                }
              ]
            },
            {
              "id": "bow",
              "description": "Longbow",
              "equipped": true,
              "features": [
                {
                  "id": "bow-atk",
                  "name": "Longbow",
                  "adjustments": {
                    "ranged": {
                      "type": "iterative", "name": "Longbow", "damage": "1d8",
                      "toHitAbility": "dex", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 20, "critMultiplier": 3, "range": 100, "damageType": ["P"]
                    }
                  }
                }
              ]
            }
          ],
          "conditions": [
            {
              "id": "prone",
              "name": "Prone",
              "active": true,
              "adjustments": { "meleeAttackRollBonus": -4 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).meleeAttackRollBonus).toBe(-4);
      expect((applied as any).rangedAttackRollBonus).toBe(0);

      const meleeDisplay = TestBed.createComponent(AttackComponent);
      meleeDisplay.componentInstance.attack = applied.melee[0];
      expect(meleeDisplay.componentInstance.attackRollBonuses()).toContain([-4, 'melee attacks']);
      expect(meleeDisplay.componentInstance.attackRollTooltips()).toEqual([[-4, 'Prone']]);

      const rangedDisplay = TestBed.createComponent(AttackComponent);
      rangedDisplay.componentInstance.attack = applied.ranged[0];
      expect(rangedDisplay.componentInstance.attackRollBonuses()).not.toContain([-4, 'melee attacks']);
    });

    it('should apply rangedAttackRollBonus only to ranged, not melee', () => {
      const char = loadCharacter(`
        {
          "inventory": [
            {
              "id": "sword",
              "description": "Longsword",
              "equipped": true,
              "features": [
                {
                  "id": "sword-atk",
                  "name": "Longsword",
                  "adjustments": {
                    "melee": {
                      "type": "iterative", "name": "Longsword", "damage": "1d8",
                      "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 19, "critMultiplier": 2, "range": 0, "damageType": ["S"]
                    }
                  }
                }
              ]
            },
            {
              "id": "bow",
              "description": "Longbow",
              "equipped": true,
              "features": [
                {
                  "id": "bow-atk",
                  "name": "Longbow",
                  "adjustments": {
                    "ranged": {
                      "type": "iterative", "name": "Longbow", "damage": "1d8",
                      "toHitAbility": "dex", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 20, "critMultiplier": 3, "range": 100, "damageType": ["P"]
                    }
                  }
                }
              ]
            }
          ],
          "conditions": [
            {
              "id": "ranged-penalty",
              "name": "Ranged Penalty",
              "active": true,
              "adjustments": { "rangedAttackRollBonus": -4 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).rangedAttackRollBonus).toBe(-4);
      expect((applied as any).meleeAttackRollBonus).toBe(0);

      const rangedDisplay = TestBed.createComponent(AttackComponent);
      rangedDisplay.componentInstance.attack = applied.ranged[0];
      expect(rangedDisplay.componentInstance.attackRollBonuses()).toContain([-4, 'ranged attacks']);
      expect(rangedDisplay.componentInstance.attackRollTooltips()).toEqual([[-4, 'Ranged Penalty']]);

      const meleeDisplay = TestBed.createComponent(AttackComponent);
      meleeDisplay.componentInstance.attack = applied.melee[0];
      expect(meleeDisplay.componentInstance.attackRollBonuses()).not.toContain([-4, 'ranged attacks']);
    });

    it('should list each condition separately in attack tooltips, not a collective total', () => {
      const char = loadCharacter(`
        {
          "inventory": [
            {
              "id": "sword",
              "description": "Longsword",
              "equipped": true,
              "features": [
                {
                  "id": "sword-atk",
                  "name": "Longsword",
                  "adjustments": {
                    "melee": {
                      "type": "iterative", "name": "Longsword", "damage": "1d8",
                      "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 19, "critMultiplier": 2, "range": 0, "damageType": ["S"]
                    }
                  }
                }
              ]
            }
          ],
          "conditions": [
            {
              "id": "Frightened",
              "name": "Frightened",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2
              }
            },
            {
              "id": "Sickend",
              "name": "Sickend",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2,
                "melee.*.damageBonus": -2,
                "ranged.*.damageBonus": -2
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      const display = TestBed.createComponent(AttackComponent);
      display.componentInstance.attack = applied.melee[0];

      expect(display.componentInstance.attackRollTooltips()).toEqual([
        [-2, 'Frightened'],
        [-2, 'Sickend']
      ]);
      expect(display.componentInstance.attackRollBonuses()).toEqual([[-4, 'all attacks']]);
    });

    it('should update attack tooltips when conditions are added, removed, or toggled', () => {
      const char = loadCharacter(`
        {
          "inventory": [
            {
              "id": "sword",
              "description": "Longsword",
              "equipped": true,
              "features": [
                {
                  "id": "sword-atk",
                  "name": "Longsword",
                  "adjustments": {
                    "melee": {
                      "type": "iterative", "name": "Longsword", "damage": "1d8",
                      "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
                      "crit": 19, "critMultiplier": 2, "range": 0, "damageType": ["S"]
                    }
                  }
                }
              ]
            }
          ],
          "conditions": [
            {
              "id": "Dazzled",
              "name": "Dazzled",
              "active": true,
              "adjustments": { "attackRollBonus": -1 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      const display = TestBed.createComponent(AttackComponent);
      display.componentInstance.attack = applied.melee[0];
      expect(display.componentInstance.attackRollTooltips()).toEqual([[-1, 'Dazzled']]);

      char.conditions[0].active = false;
      char.conditions.push(JSON.parse(`
        {
          "id": "Frightened",
          "name": "Frightened",
          "active": true,
          "adjustments": { "attackRollBonus": -2 }
        }
      `));
      service.update();
      display.componentInstance.attack = service.applied().melee[0];
      expect(display.componentInstance.attackRollTooltips()).toEqual([[-2, 'Frightened']]);

      char.conditions.pop();
      service.update();
      display.componentInstance.attack = service.applied().melee[0];
      expect(display.componentInstance.attackRollTooltips()).toEqual([]);
    });

    it('should not use instanceof to detect melee vs ranged attacks', () => {
      const char = loadCharacter(`
        {
          "melee": [
            {
              "type": "iterative", "name": "Sword", "damage": "1d8",
              "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
              "crit": 19, "critMultiplier": 2, "range": 0, "damageType": ["S"]
            }
          ],
          "ranged": [
            {
              "type": "iterative", "name": "Bow", "damage": "1d8",
              "toHitAbility": "dex", "toHitBonus": 0, "damageAbility": "str",
              "crit": 20, "critMultiplier": 3, "range": 100, "damageType": ["P"]
            }
          ],
          "conditions": [
            {
              "id": "test-atk",
              "name": "Test Attack Bonus",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "meleeAttackRollBonus": -1,
                "rangedAttackRollBonus": -3
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-2);
      expect((applied as any).meleeAttackRollBonus).toBe(-1);
      expect((applied as any).rangedAttackRollBonus).toBe(-3);
    });
  });

  describe('Conditions service integration', () => {
    let conditionsService: ConditionsService;

    beforeEach(() => {
      conditionsService = TestBed.inject(ConditionsService);
    });

    const conditionJson = (id: string): any =>
      asJson(conditionsService.list.find(c => c.id === id));

    it('Dazzled should apply -1 to attackRollBonus', () => {
      expect(conditionJson('Dazzled').adjustments.attackRollBonus).toBe(-1);
    });

    it('Frightened should apply -2 to attackRollBonus, savingThrowBonus, and skillCheckBonus', () => {
      const frightened = conditionJson('Frightened');
      expect(frightened.adjustments.attackRollBonus).toBe(-2);
      expect(frightened.adjustments.savingThrowBonus).toBe(-2);
      expect(frightened.adjustments.skillCheckBonus).toBe(-2);
    });

    it('Grappled should apply -2 to attackRollBonus in addition to existing cmb penalty', () => {
      const grappled = conditionJson('Grappled');
      expect(grappled.adjustments.attackRollBonus).toBe(-2);
      expect(grappled.adjustments.cmb).toBe(-2);
      expect(grappled.adjustments['abilityScores.dex']).toBe(-4);
    });

    it('Prone should apply -4 to meleeAttackRollBonus', () => {
      expect(conditionJson('Prone').adjustments.meleeAttackRollBonus).toBe(-4);
    });

    it('Shaken should apply -2 to attackRollBonus, savingThrowBonus, and skillCheckBonus', () => {
      const shaken = conditionJson('Shaken');
      expect(shaken.adjustments.attackRollBonus).toBe(-2);
      expect(shaken.adjustments.savingThrowBonus).toBe(-2);
      expect(shaken.adjustments.skillCheckBonus).toBe(-2);
    });

    it('Sickened should apply -2 to attackRollBonus, savingThrowBonus, skillCheckBonus, and weapon damage', () => {
      const sickened = conditionJson('Sickend');
      expect(sickened.adjustments.attackRollBonus).toBe(-2);
      expect(sickened.adjustments.savingThrowBonus).toBe(-2);
      expect(sickened.adjustments.skillCheckBonus).toBe(-2);
      expect(sickened.adjustments['melee.*.damageBonus']).toBe(-2);
      expect(sickened.adjustments['ranged.*.damageBonus']).toBe(-2);
    });
  });

  describe('Conditions applied to character', () => {
    it('should apply Frightened condition adjustments to all relevant bonuses', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "Frightened",
              "name": "Frightened",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-2);
      expect((applied as any).savingThrowBonus).toBe(-2);
      expect((applied as any).skillCheckBonus).toBe(-2);
    });

    it('should apply Grappled condition with attackRollBonus and cmb penalty', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "Grappled",
              "name": "Grappled",
              "active": true,
              "adjustments": {
                "abilityScores.dex": -4,
                "attackRollBonus": -2,
                "cmb": -2
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-2);
      expect(applied.cmb).toBe(-2);
    });

    it('should apply Prone meleeAttackRollBonus without affecting rangedAttackRollBonus', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "Prone",
              "name": "Prone",
              "active": true,
              "adjustments": { "meleeAttackRollBonus": -4 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).meleeAttackRollBonus).toBe(-4);
      expect((applied as any).rangedAttackRollBonus).toBe(0);
    });

    it('should apply Sickened with damage penalties on melee and ranged attacks', () => {
      const char = loadCharacter(`
        {
          "inventory": [
            {
              "id": "sword",
              "description": "Longsword",
              "equipped": true,
              "features": [
                {
                  "id": "sword-atk",
                  "name": "Longsword",
                  "adjustments": {
                    "melee": {
                      "type": "iterative", "name": "Longsword", "damage": "1d8",
                      "toHitAbility": "str", "toHitBonus": 0, "damageAbility": "str",
                      "damageBonus": 0, "crit": 19, "critMultiplier": 2, "range": 0, "damageType": ["S"]
                    }
                  }
                }
              ]
            },
            {
              "id": "bow",
              "description": "Longbow",
              "equipped": true,
              "features": [
                {
                  "id": "bow-atk",
                  "name": "Longbow",
                  "adjustments": {
                    "ranged": {
                      "type": "iterative", "name": "Longbow", "damage": "1d8",
                      "toHitAbility": "dex", "toHitBonus": 0, "damageAbility": "str",
                      "damageBonus": 0, "crit": 20, "critMultiplier": 3, "range": 100, "damageType": ["P"]
                    }
                  }
                }
              ]
            }
          ],
          "conditions": [
            {
              "id": "Sickend",
              "name": "Sickend",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2,
                "melee.*.damageBonus": -2,
                "ranged.*.damageBonus": -2
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-2);
      expect((applied as any).savingThrowBonus).toBe(-2);
      expect((applied as any).skillCheckBonus).toBe(-2);
      expect(applied.melee[0].damageBonus).toBe(-2);
      expect(applied.ranged[0].damageBonus).toBe(-2);
    });

    it('should stack Frightened and Dazzled attackRollBonus penalties', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "Frightened",
              "name": "Frightened",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2
              }
            },
            {
              "id": "Dazzled",
              "name": "Dazzled",
              "active": true,
              "adjustments": { "attackRollBonus": -1 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-3);
    });

    it('should apply Shaken and Prone together with independent bonuses', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "Shaken",
              "name": "Shaken",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "savingThrowBonus": -2,
                "skillCheckBonus": -2
              }
            },
            {
              "id": "Prone",
              "name": "Prone",
              "active": true,
              "adjustments": { "meleeAttackRollBonus": -4 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-2);
      expect((applied as any).meleeAttackRollBonus).toBe(-4);
      expect((applied as any).savingThrowBonus).toBe(-2);
      expect((applied as any).skillCheckBonus).toBe(-2);
    });
  });

  describe('Combat maneuver checks', () => {
    it('should apply cmb penalty via direct adjustment (e.g., Grappled)', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "grappled",
              "name": "Grappled",
              "active": true,
              "adjustments": { "cmb": -2 }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect(applied.cmb).toBe(-2);
    });
  });

  describe('Attack bonus properties read from character, not via additional input', () => {
    it('should have attackRollBonus, meleeAttackRollBonus, rangedAttackRollBonus as character properties', () => {
      const char = loadCharacter(`
        {
          "conditions": [
            {
              "id": "multi-atk-bonus",
              "name": "Multi Attack Bonus",
              "active": true,
              "adjustments": {
                "attackRollBonus": -2,
                "meleeAttackRollBonus": -1,
                "rangedAttackRollBonus": -3
              }
            }
          ]
        }
      `);

      service.initializeCharacter(char);
      const applied = service.applied();

      expect((applied as any).attackRollBonus).toBe(-2);
      expect((applied as any).meleeAttackRollBonus).toBe(-1);
      expect((applied as any).rangedAttackRollBonus).toBe(-3);
      expect(service.adjustmentsMap['attackRollBonus']).toBeDefined();
      expect(service.adjustmentsMap['meleeAttackRollBonus']).toBeDefined();
      expect(service.adjustmentsMap['rangedAttackRollBonus']).toBeDefined();
    });
  });
});
