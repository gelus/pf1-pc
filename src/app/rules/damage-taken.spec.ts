import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { Feature } from '../interfaces/character.interface';
import { currentHpChange, stabilityChange } from './damage-taken';

describe('damage taken', () => {
  let service: ApplyCharacterService;

  const apply = (char: Character): Character => {
    service.initializeCharacter(char);
    return service.applied();
  };
  const conditionNames = (): string[] => service.ruleConditions().map(c => c.name || '');

  // a 2nd level fighter with Con 12: 10 + 6 hp from its hit dice, +1 a level, 18 hp
  const fighter = (changes: Partial<Character> = {}): Character => {
    const char = new Character();
    char.classLevels = [
      new ClassLevel({name: 'Fighter', level: 1, hitDice: 10}),
      new ClassLevel({name: 'Fighter', level: 2, hitDice: 10, rolledHp: 6}),
    ];
    char.abilityScores = {str: 16, dex: 14, con: 12, int: 10, wis: 12, cha: 8};
    return Object.assign(char, changes);
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('starts a new character at full hp, under no condition', () => {
    const applied = apply(fighter());
    expect(applied.hp).toBe(18);
    expect(applied.currentHp).toBe(18);
    expect(conditionNames()).toEqual([]);
  });

  it('does not wound a character without hit dice', () => {
    const applied = apply(new Character());
    expect(applied.currentHp).toBe(0);
    expect(conditionNames()).toEqual([]);
    expect(applied.speed.land).toBe(0);
  });

  it('takes the damage taken off the max hp, which current hp follows', () => {
    expect(apply(fighter({damageTaken: 5})).currentHp).toBe(13);
    // Con damage lowers max hp, the damage taken stays
    expect(apply(fighter({damageTaken: 5, abilityDamage: {con: 2}})).currentHp).toBe(11);
  });

  it('works the damage taken out from the current hp of a character saved before it', () => {
    const saved = fighter({currentHp: 7});
    delete saved.damageTaken;
    const applied = apply(saved);
    expect(applied.damageTaken).toBe(11);
    expect(applied.currentHp).toBe(7);
    expect(apply(fighter({currentHp: -3})).currentHp).toBe(-3);
    // 0 is what every character was saved with until it was hurt
    expect(apply(fighter({currentHp: 0})).currentHp).toBe(18);
    expect(apply(fighter({currentHp: 25})).currentHp).toBe(18);
  });

  it('disables the character at 0 hp', () => {
    const char = fighter({damageTaken: 18});
    char.race.features.push(new Feature({name: 'Speed', adjustments: {'speed.land': 30}}));
    const applied = apply(char);
    expect(conditionNames()).toEqual(['Disabled']);
    expect(service.ruleConditions()[0].reason).toBe('0 hp');
    expect(applied.speed.land).toBe(15);
  });

  it('has the character dying below 0 hp, unconscious and helpless', () => {
    const applied = apply(fighter({damageTaken: 19}));
    expect(conditionNames()).toEqual(['Dying']);
    expect(applied.abilityScores.dex).toBe(0);
  });

  it('keeps a stable character stable below 0 hp instead of dying', () => {
    const char = fighter({damageTaken: 20});
    char.conditions.push(new Feature({name: 'Stable', adjustments: {}}));
    apply(char);
    expect(conditionNames()).toEqual(['Stable']);
    expect(service.adjustmentsMap['abilityScores.dex'].map(e => e.origin)).toContain('Helpless');
  });

  it('keeps a character with the stable flag stable below 0 hp', () => {
    const applied = apply(fighter({damageTaken: 20, stable: true}));
    expect(conditionNames()).toEqual(['Stable']);
    expect(service.ruleConditions()[0].reason).toBe('-2 hp, stabilized');
    expect(applied.abilityScores.dex).toBe(0);
    // stable only means something while the character is below 0 hp
    apply(fighter({damageTaken: 18, stable: true}));
    expect(conditionNames()).toEqual(['Disabled']);
  });

  it('says where its conditions come from, and keeps the description and adjustments of their templates', () => {
    apply(fighter({damageTaken: 19}));
    const [dying] = service.ruleConditions();
    expect(dying.source).toBe('from hit points');
    expect(dying.reason).toBe('-1 hp');
    expect(dying.description).toContain('A dying creature is unconscious and near death');
    apply(fighter({damageTaken: 8, nonlethalDamage: 10}));
    const [staggered] = service.ruleConditions();
    expect(staggered.source).toBe('from nonlethal damage');
    expect(staggered.description).toContain('staggered');
  });

  describe('stabilizing', () => {
    const dying = (changes: Partial<Character> = {}): Character => {
      const char = fighter({damageTaken: 20, ...changes});
      return Object.assign(char, {currentHp: -2, hp: 18});
    };

    it('stabilizes the character and makes it dying again with the stable flag', () => {
      expect(stabilityChange(fighter(), true)).toEqual({stable: true});
      expect(stabilityChange(fighter({stable: true}), false)).toEqual({stable: false});
    });

    it('takes a Stable condition added by hand off when the character is dying again', () => {
      const char = fighter();
      const shaken = new Feature({name: 'Shaken', adjustments: {}});
      char.conditions.push(new Feature({name: 'Stable', adjustments: {}}), shaken);
      expect(stabilityChange(char, false)).toEqual({stable: false, conditions: [shaken]});
      // stabilizing leaves them be
      expect(stabilityChange(char, true)).toEqual({stable: true});
    });

    it('stores the damage that leaves the character with the hp entered', () => {
      expect(currentHpChange(fighter(), Object.assign(fighter(), {hp: 18, currentHp: 18}), 5)).toEqual({damageTaken: 13});
      expect(currentHpChange(fighter(), Object.assign(fighter(), {hp: 18, currentHp: 18}), 30)).toEqual({damageTaken: 0});
    });

    it('keeps a stable character stable while its hp stays below 0 without it taking damage', () => {
      const raw = dying({stable: true});
      expect(currentHpChange(raw, raw, -2)).toEqual({damageTaken: 20});
      expect(currentHpChange(raw, raw, -1)).toEqual({damageTaken: 19});
    });

    it('makes a stable character dying again when it takes more damage', () => {
      const raw = dying({stable: true});
      expect(currentHpChange(raw, raw, -3)).toEqual({damageTaken: 21, stable: false});
      const handAdded = dying();
      handAdded.conditions.push(new Feature({name: 'Stable', adjustments: {}}));
      expect(currentHpChange(handAdded, handAdded, -4)).toEqual({damageTaken: 22, stable: false, conditions: []});
    });

    it('is no longer stable once healed to 0 hp or more', () => {
      const raw = dying({stable: true});
      expect(currentHpChange(raw, raw, 0)).toEqual({damageTaken: 18, stable: false});
      expect(currentHpChange(raw, raw, 5)).toEqual({damageTaken: 13, stable: false});
    });

    it('leaves a dying character dying when it takes more damage', () => {
      const raw = dying();
      expect(currentHpChange(raw, raw, -5)).toEqual({damageTaken: 23});
    });

    it('stabilizes a dying character that is healed but stays below 0 hp', () => {
      const raw = dying();
      expect(currentHpChange(raw, raw, -1)).toEqual({damageTaken: 19, stable: true});
    });

    it('makes a character dying, not stable, when damage takes it below 0 hp', () => {
      const raw = fighter();
      expect(currentHpChange(raw, Object.assign(fighter(), {hp: 18, currentHp: 18}), -3)).toEqual({damageTaken: 21});
    });

    it('stabilizes, then makes dying again, as a dying character is healed and hurt', () => {
      const raw = dying();
      const healed = currentHpChange(raw, raw, -1);
      expect(healed.stable).toBeTrue();
      const stabilized = Object.assign(dying(healed), {currentHp: -1});
      expect(currentHpChange(stabilized, stabilized, -4)).toEqual({damageTaken: 22, stable: false});
    });
  });

  it('kills the character at a negative amount of hp equal to its Con score', () => {
    apply(fighter({damageTaken: 29}));
    expect(conditionNames()).toEqual(['Dying']);
    apply(fighter({damageTaken: 30}));
    expect(conditionNames()).toEqual(['Dead']);
    // drain lowers the Con score, damage only its modifier: 18 - 2 = 16 hp, dead at -10
    apply(fighter({damageTaken: 26, abilityDrain: {con: 2}}));
    expect(conditionNames()).toEqual(['Dead']);
    apply(fighter({damageTaken: 26, abilityDamage: {con: 2}}));
    expect(conditionNames()).toEqual(['Dying']);
  });

  it('staggers the character at nonlethal damage equal to its current hp', () => {
    apply(fighter({damageTaken: 8, nonlethalDamage: 10}));
    expect(conditionNames()).toEqual(['Staggered']);
    expect(service.ruleConditions()[0].reason).toBe('10 nonlethal damage = 10 hp');
  });

  it('knocks the character unconscious at more nonlethal damage than its current hp', () => {
    const applied = apply(fighter({damageTaken: 8, nonlethalDamage: 11}));
    expect(conditionNames()).toEqual(['Unconscious']);
    expect(applied.abilityScores.dex).toBe(0);
    apply(fighter({damageTaken: 8, nonlethalDamage: 9}));
    expect(conditionNames()).toEqual([]);
  });
});
