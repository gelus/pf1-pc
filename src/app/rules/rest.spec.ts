import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { Feature, Spell } from '../interfaces/character.interface';
import { Item } from '../utils/item.class';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { PERCENTILE_ROLL } from './spellcasting';
import { restChange, restSummaryText } from './rest';

describe('rest', () => {
  let service: ApplyCharacterService;

  const apply = (char: Character): Character => {
    service.initializeCharacter(char);
    return service.applied();
  };

  // a 4th level fighter with Con 12: 10 + 3 × 6 hp from its hit dice, +1 a level, 32 hp
  const fighter = (changes: Partial<Character> = {}): Character => {
    const char = new Character();
    char.classLevels = [1, 2, 3, 4].map(level => new ClassLevel({name: 'Fighter', level, hitDice: 10, rolledHp: level > 1 ? 6 : 0}));
    char.abilityScores = {str: 16, dex: 14, con: 12, int: 10, wis: 12, cha: 8};
    return Object.assign(char, changes);
  };

  const rest = (char: Character, kind: 'night' | 'bedRest' = 'night', longTermCare = false) =>
    restChange(char, apply(char), {kind, longTermCare});

  const fatigued = () => new Feature({id: 'Fatigued', name: 'Fatigued', description: 'fatigued', adjustments: {}, active: true});
  const exhausted = () => new Feature({id: 'Exhausted', name: 'Exhausted', description: 'exhausted', adjustments: {}, active: true});

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [{provide: PERCENTILE_ROLL, useValue: () => 50}]});
    service = TestBed.inject(ApplyCharacterService);
  });

  describe('natural healing', () => {
    it('heals 1 hp per character level for a night, 2 for a day of bed rest', () => {
      const night = rest(fighter({damageTaken: 10}));
      expect(night.change.damageTaken).toBe(6);
      expect(night.summary.hp).toEqual({before: 22, after: 26, healed: 4, max: 32});
      expect(rest(fighter({damageTaken: 10}), 'bedRest').change.damageTaken).toBe(2);
    });

    it('doubles it with long-term care', () => {
      expect(rest(fighter({damageTaken: 20}), 'night', true).change.damageTaken).toBe(12);
      expect(rest(fighter({damageTaken: 20}), 'bedRest', true).change.damageTaken).toBe(4);
    });

    it('never heals past full hp, and leaves an unhurt character alone', () => {
      const result = rest(fighter({damageTaken: 3}), 'bedRest');
      expect(result.change.damageTaken).toBe(0);
      expect(result.summary.hp.healed).toBe(3);
      const unhurt = rest(fighter());
      expect(unhurt.change).toEqual({});
      expect(restSummaryText(unhurt.summary)).toBe('nothing to recover');
    });

    it('heals a character saved with its current hp only', () => {
      const char = fighter({currentHp: 20});
      delete char.damageTaken;
      expect(rest(char).change.damageTaken).toBe(8);
    });

    it('heals 1 nonlethal damage per level every hour, not doubled by long-term care', () => {
      expect(rest(fighter({nonlethalDamage: 40})).change.nonlethalDamage).toBe(8);
      expect(rest(fighter({nonlethalDamage: 40}), 'night', true).change.nonlethalDamage).toBe(8);
      expect(rest(fighter({nonlethalDamage: 40}), 'bedRest').change.nonlethalDamage).toBe(0);
      expect(rest(fighter({nonlethalDamage: 40})).summary.nonlethal).toEqual({before: 40, after: 8, healed: 32});
    });

    it('heals ability damage, 1 point a night and 2 a day, doubled by long-term care, never drain', () => {
      const char = () => fighter({abilityDamage: {str: 3, con: 1, wis: 0}, abilityDrain: {dex: 2}});
      const night = rest(char());
      expect(night.change.abilityDamage).toEqual({str: 2, con: 0, wis: 0});
      expect(night.change.abilityDrain).toBeUndefined();
      expect(night.summary.abilityDamage).toEqual([{ability: 'str', before: 3, after: 2}, {ability: 'con', before: 1, after: 0}]);
      expect(rest(char(), 'bedRest').change.abilityDamage).toEqual({str: 1, con: 0, wis: 0});
      expect(rest(char(), 'night', true).change.abilityDamage).toEqual({str: 1, con: 0, wis: 0});
      expect(rest(char(), 'bedRest', true).change.abilityDamage).toEqual({str: 0, con: 0, wis: 0});
    });

    it('does not change the raw character it is given', () => {
      const char = fighter({damageTaken: 10, abilityDamage: {str: 2}, conditions: [fatigued()]});
      const before = JSON.stringify(char);
      rest(char);
      expect(JSON.stringify(char)).toBe(before);
    });
  });

  describe('below 0 hp', () => {
    it('does not rest a dying character', () => {
      // 32 hp, 35 damage: -3 hp, dying
      const result = rest(fighter({damageTaken: 35, nonlethalDamage: 5, conditions: [fatigued()]}));
      expect(result.change).toEqual({});
      expect(result.summary.rested).toBeFalse();
      expect(result.summary.blockedBy).toBe('dying');
      expect(restSummaryText(result.summary)).toContain('dying');
    });

    it('does not rest a dead character', () => {
      const result = rest(fighter({damageTaken: 50}));
      expect(result.summary.blockedBy).toBe('dead');
      expect(result.change).toEqual({});
    });

    it('heals no hp of a stable character, the rest of the rest still happens', () => {
      const result = rest(fighter({damageTaken: 35, stable: true, nonlethalDamage: 5, abilityDamage: {str: 1}}));
      expect(result.summary.rested).toBeTrue();
      expect(result.change.damageTaken).toBeUndefined();
      expect(result.change.nonlethalDamage).toBe(0);
      expect(result.change.abilityDamage).toEqual({str: 0});
      expect(result.summary.notes[0]).toContain('DC 10 Constitution');
      expect(restSummaryText(result.summary)).toContain('no hp (stable, below 0)');
    });
  });

  describe('daily resources', () => {
    const preset = (name: string) => CLASS_PRESETS.find(p => p.name === name)!;
    const spell = (name: string, extra: Partial<Spell> = {}): Spell => ({
      name, school: 'evocation', castingTime: '1 standard action', components: ['V'], range: 'close',
      target: 'one creature', duration: 'instantaneous', savingThrow: 'none', spellResistance: true,
      description: name, ...extra,
    });
    const wizard = (): Character => {
      const char = new Character();
      Object.assign(char.abilityScores, {int: 14});
      char.classLevels = [classLevelFromPreset(preset('Wizard'), 1, true)];
      char.spells = {wizard: {name: '', ability: '', casterLevel: 0, concentration: 0, school: 'evocation', spells: [
        {perDay: {total: 0, current: 0}, spells: [spell('Light')]},
        {perDay: {total: 0, current: 0}, spells: [spell('Magic Missile')]},
      ]}};
      return char;
    };

    it('refills the slots of every caster, a prepared caster keeps what it prepared', () => {
      apply(wizard());
      service.prepareSpell('wizard', 1, 'Magic Missile');
      service.prepareSpell('wizard', 1, 'Magic Missile', 'extra');
      const missile = service.applied().spells['wizard'].spells[1].spells[0];
      service.cast('spells', 'wizard', 1, missile);
      service.cast('spells', 'wizard', 1, missile);
      const raw = service.raw();
      const {change, summary} = restChange(raw, service.applied(), {kind: 'night'});
      expect(summary.spellcasting).toEqual([
        {type: 'spells', origin: 'wizard', name: 'Wizard', slots: 1, extraSlots: 1, preparedSpells: 2},
      ]);
      expect(restSummaryText(summary)).toBe('slots refilled');
      const level = change.spells!['wizard'].spells[1];
      expect(level.prepared!.map(p => [p.name, !!p.cast])).toEqual([['Magic Missile', false], ['Magic Missile', false]]);
      expect(level.used || 0).toBe(0);
      expect(level.extraUsed || 0).toBe(0);
      // the raw character is left as it is
      expect(raw.spells['wizard'].spells[1].prepared!.every(p => p.cast)).toBeTrue();

      service.update(change);
      expect(service.applied().spells['wizard'].spells[1].perDay.current).toBe(2);
      expect(service.applied().spells['wizard'].spells[1].extraSlot!.current).toBe(1);
    });

    it('refills the slots features give a caster', () => {
      const char = fighter();
      char.feats = [new Feature({name: 'Minor Magic', adjustments: {
        'spellLikeAbilities.gnome': {name: 'Gnome', ability: 'cha', casterLevel: 1, concentration: 1, spells: [
          {perDay: {total: 1, current: 0}, spells: [spell('Dancing Lights')]},
        ]},
      }})];
      const {change, summary} = rest(char);
      expect(summary.spellcasting.find(c => c.origin === 'gnome')!.slots).toBe(1);
      expect((change.feats![0].adjustments as any)['spellLikeAbilities.gnome'].spells[0].perDay.current).toBe(1);
    });

    it('refills daily and per-encounter charges wherever the features are, never others', () => {
      const charges = (name: string, current: number, total: number, label = '', per?: any) =>
        new Feature({name, adjustments: {}, charges: {current, total, label, ...(per ? {per} : {})}});
      const char = fighter();
      char.classLevels[0].features = [charges('Rage', 0, 3, 'rounds per day')];
      char.race.features = [charges('Gnome Magic', 0, 1, '', 'day')];
      char.feats = [charges('Stunning Fist', 1, 4, 'per day')];
      char.specialAttack = [charges('Smite', 0, 1, 'per encounter')];
      char.conditions = [charges('Blessing', 0, 2, 'per day')];
      char.traits = [charges('Lucky', 0, 1, 'per day', 'none')];
      char.inventory = [Object.assign(new Item(), {name: 'Wand', features: [charges('Wand', 10, 50, 'charges')]}),
        Object.assign(new Item(), {name: 'Ring', equipped: false, features: [charges('Ring of Sparks', 1, 3, '3/day')]})];
      const {change, summary} = rest(char);
      expect(summary.charges.map(c => [c.location, c.name, c.before, c.after, c.per])).toEqual([
        ['classLevels.0.features', 'Rage', 0, 3, 'day'],
        ['race.features', 'Gnome Magic', 0, 1, 'day'],
        ['feats', 'Stunning Fist', 1, 4, 'day'],
        ['specialAttack', 'Smite', 0, 1, 'encounter'],
        ['conditions', 'Blessing', 0, 2, 'day'],
        ['inventory.1.features', 'Ring of Sparks', 1, 3, 'day'],
      ]);
      expect(change.classLevels![0].features[0].charges!.current).toBe(3);
      expect(change.traits).toBeUndefined();
      expect(change.inventory![0].features[0].charges!.current).toBe(10);
      expect(restSummaryText(summary)).toContain('Rage 0 → 3');
    });

    it('refills the charges of a feature another feature gives (a class feature giving Rage as a special attack)', () => {
      const char = fighter();
      const rage = new Feature({name: 'Rage', adjustments: {}, charges: {current: 1, total: 4, label: 'rages per day'}});
      char.classLevels[0].features = [new Feature({name: 'Barbarian Rage', adjustments: {specialAttack: rage}})];
      const {change, summary} = rest(char);
      expect(summary.charges.map(c => [c.location, c.name, c.before, c.after])).toEqual([
        ['classLevels.0.features.0.adjustments.specialAttack', 'Rage', 1, 4],
      ]);
      expect((change.classLevels![0].features[0].adjustments['specialAttack'] as any).charges.current).toBe(4);
    });
  });

  describe('conditions', () => {
    it('ends fatigue with a night, and leaves an exhausted character fatigued', () => {
      const result = rest(fighter({conditions: [fatigued()]}));
      expect(result.change.conditions).toEqual([]);
      expect(result.summary.conditions).toEqual([{name: 'Fatigued', change: 'removed'}]);

      const tired = rest(fighter({conditions: [exhausted()]}));
      expect(tired.change.conditions!.map(c => c.name)).toEqual(['Fatigued']);
      // the Fatigued of the condition templates, with its penalties
      expect(tired.change.conditions![0].adjustments).toEqual(
        jasmine.objectContaining({'abilityScores.str': jasmine.anything()}) as any);
      expect(restSummaryText(tired.summary)).toBe('Exhausted → Fatigued');
    });

    it('ends both with a day of bed rest', () => {
      const result = rest(fighter({conditions: [exhausted(), fatigued()]}), 'bedRest');
      expect(result.change.conditions).toEqual([]);
      expect(result.summary.conditions.map(c => c.change)).toEqual(['removed', 'removed']);
    });

    it('leaves other and inactive conditions alone', () => {
      const shaken = new Feature({name: 'Shaken', adjustments: {}, active: true});
      const off = Object.assign(fatigued(), {active: false});
      const result = rest(fighter({conditions: [shaken, off]}));
      expect(result.change.conditions).toBeUndefined();
    });
  });

  describe('service', () => {
    it('rests the character and keeps what the rest did', () => {
      apply(fighter({damageTaken: 10, tempHp: 5, conditions: [fatigued()]}));
      const summary = service.rest({kind: 'night'});
      expect(service.applied().currentHp).toBe(26);
      expect(service.raw().conditions).toEqual([]);
      expect(service.lastRest()).toBe(summary);
      expect(service.raw().tempHp).toBe(5);
      expect(summary.notes.some(note => note.includes('temporary hit points'))).toBeTrue();
      expect(restSummaryText(summary)).toBe('+4 hp, Fatigued removed');
    });

    it('leaves a dying character as it is', () => {
      apply(fighter({damageTaken: 35}));
      const before = service.raw();
      expect(service.rest({kind: 'bedRest'}).rested).toBeFalse();
      expect(service.raw()).toBe(before);
    });
  });
});
