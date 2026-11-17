import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature, Spell } from '../interfaces/character.interface';
import { Armor } from '../utils/item.class';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { PERCENTILE_ROLL, spellcastingRule } from './spellcasting';
import { bonusSpells, spellsKnown, spellsPerDay } from './spell-tables';
import exampleCleric from '../example-cleric.json';

describe('spellcasting rule', () => {
  let service: ApplyCharacterService;
  let roll: number;

  const preset = (name: string) => CLASS_PRESETS.find(p => p.name === name)!;
  const levels = (name: string, count: number, from = 1) =>
    Array.from({length: count}, (_x, i) => classLevelFromPreset(preset(name), from + i, from + i === 1));

  const spell = (name: string, extra: Partial<Spell> = {}): Spell => ({
    name, school: 'evocation', castingTime: '1 standard action', components: ['V', 'S'], range: 'close',
    target: 'one creature', duration: 'instantaneous', savingThrow: 'Reflex half', spellResistance: true,
    description: name, ...extra,
  });

  const caster = (name: string, count: number, scores: Partial<Character['abilityScores']> = {}): Character => {
    const char = new Character();
    Object.assign(char.abilityScores, scores);
    char.classLevels = levels(name, count);
    return char;
  };

  const apply = (char: Character): Character => {
    service.initializeCharacter(char);
    return service.applied();
  };

  beforeEach(() => {
    roll = 50;
    TestBed.configureTestingModule({providers: [{provide: PERCENTILE_ROLL, useValue: () => roll}]});
    service = TestBed.inject(ApplyCharacterService);
  });

  describe('tables', () => {
    it('gives the bonus spells of table 1-3', () => {
      expect([1, 2, 3, 4].map(level => bonusSpells(0, level))).toEqual([0, 0, 0, 0]);
      expect([1, 2, 3, 4].map(level => bonusSpells(3, level))).toEqual([1, 1, 1, 0]);
      // score 20 (+5): 2 1 1 1 1, score 30 (+10): 3 3 2 2 2 2 1 1 1
      expect([1, 2, 3, 4, 5, 6].map(level => bonusSpells(5, level))).toEqual([2, 1, 1, 1, 1, 0]);
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => bonusSpells(10, level))).toEqual([3, 3, 2, 2, 2, 2, 1, 1, 1]);
      expect(bonusSpells(5, 0)).toBe(0);
    });

    it('reads the class tables, null for a dash', () => {
      expect(spellsPerDay('wizard', 1, 0)).toBe(3);
      expect(spellsPerDay('wizard', 20, 9)).toBe(4);
      expect(spellsPerDay('sorcerer', 4, 2)).toBe(3);
      expect(spellsPerDay('sorcerer', 1, 0)).toBeNull();
      expect(spellsKnown('sorcerer', 1, 0)).toBe(4);
      expect(spellsKnown('bard', 7, 3)).toBe(2);
      expect(spellsPerDay('paladin', 3, 1)).toBeNull();
      expect(spellsPerDay('paladin', 4, 1)).toBe(0);
      expect(spellsPerDay('ranger', 20, 4)).toBe(3);
    });
  });

  describe('class casters', () => {
    it('makes a 3rd level cleric a prepared divine caster with orisons, bonus spells and domain slots', () => {
      const cleric = apply(caster('Cleric', 3, {wis: 16})).spells['cleric'];
      expect(cleric.name).toBe('Cleric');
      expect(cleric.ability).toBe('wis');
      expect(cleric.casting).toBe('prepared');
      expect(cleric.arcane).toBeFalse();
      expect(cleric.casterLevel).toBe(3);
      expect(cleric.concentration).toBe(3);
      expect(cleric.spells.length).toBe(3);
      expect(cleric.spells[0].perDay).toEqual({total: 4, current: 4});
      expect(cleric.spells[0].atWill).toBeTrue();
      expect(cleric.spells[0].extraSlot).toBeUndefined();
      // wis 16 (+3): one bonus spell of 1st, 2nd and 3rd level, but a 3rd level cleric casts no 3rd level spells
      expect(cleric.spells[1].perDay).toEqual({total: 3, current: 3});
      expect([cleric.spells[1].base, cleric.spells[1].bonus]).toEqual([2, 1]);
      expect(cleric.spells[2].perDay).toEqual({total: 2, current: 2});
      expect(cleric.spells[1].extraSlot).toEqual({kind: 'domain', total: 1, current: 1, label: 'domain'});
      expect(cleric.maxSpellLevel).toBe(6);
    });

    it('shows where the slots come from in the tooltips', () => {
      apply(caster('Cleric', 1, {wis: 14}));
      expect(service.adjustmentsMap['spells.cleric.spells.1.perDay.total'].map(entry => [entry.origin, entry.value]))
        .toEqual([['Cleric 1 (spellcasting)', 1], ['Wis 14 (cleric bonus spells)', 1]]);
    });

    it('takes bonus spells from the final ability, a headband included', () => {
      const char = caster('Wizard', 1, {int: 15});
      char.feats.push(new Feature({name: 'Headband', adjustments: {'abilityScores.int': 2}}));
      expect(apply(char).spells['wizard'].spells[1].perDay.total).toBe(1 + 1);
    });

    it('gives spontaneous casters their spells known and no 0-level slots', () => {
      const sorcerer = apply(caster('Sorcerer', 4, {cha: 18})).spells['sorcerer'];
      expect(sorcerer.casting).toBe('spontaneous');
      expect(sorcerer.arcane).toBeTrue();
      expect(sorcerer.spells[0]).toEqual(jasmine.objectContaining({atWill: true, known: 6, base: 0, bonus: 0}));
      expect(sorcerer.spells[1].perDay.total).toBe(6 + 1);
      expect(sorcerer.spells[1].known).toBe(3);
      expect(sorcerer.spells[2].perDay.total).toBe(3 + 1);
      expect(sorcerer.spells[2].known).toBe(1);
      expect(sorcerer.spells[3]).toBeUndefined();
    });

    it('gives a paladin no caster below 4th level and caster level 1 with only bonus spells at 4th', () => {
      expect(apply(caster('Paladin', 3, {cha: 16})).spells['paladin']).toBeUndefined();
      const paladin = apply(caster('Paladin', 4, {cha: 16})).spells['paladin'];
      expect(paladin.casterLevel).toBe(1);
      expect(paladin.spells[0]).toBeFalsy();
      expect(paladin.spells[1].perDay.total).toBe(0 + 1);
      expect(paladin.spells[2]).toBeUndefined();
    });

    it('gives a level whose table entry is 0 no slots without bonus spells', () => {
      const ranger = apply(caster('Ranger', 4, {wis: 11})).spells['ranger'];
      expect(ranger.spells[1].perDay.total).toBe(0);
    });

    it('keeps each class of a multiclass character its own caster', () => {
      const char = new Character();
      Object.assign(char.abilityScores, {int: 14, wis: 12});
      char.classLevels = [...levels('Wizard', 2), ...levels('Cleric', 1)];
      const applied = apply(char);
      expect(applied.spells['wizard'].casterLevel).toBe(2);
      expect(applied.spells['wizard'].spells[1].perDay.total).toBe(2 + 1);
      expect(applied.spells['cleric'].casterLevel).toBe(1);
      expect(applied.spells['cleric'].spells[1].perDay.total).toBe(1 + 1);
    });

    it('lets features add to a class caster', () => {
      const char = caster('Wizard', 1, {int: 10});
      char.feats.push(new Feature({name: 'Ring', adjustments: {'spells.wizard.casterLevel': 1, 'spells.wizard.spells.1.perDay.total': 1}}));
      const wizard = apply(char).spells['wizard'];
      expect(wizard.casterLevel).toBe(2);
      expect(wizard.spells[1].perDay.total).toBe(2);
    });

    it('only runs for classes that give spellcasting', () => {
      service.ruleModules = [spellcastingRule];
      expect(apply(caster('Fighter', 5)).spells).toEqual({});
    });
  });

  describe('save DCs and the highest spell level', () => {
    it('works the DCs out per level and per spell, with feature bonuses', () => {
      const char = caster('Wizard', 3, {int: 16});
      char.spells = {wizard: {name: '', ability: '', casterLevel: 0, concentration: 0, spells: [
        undefined as any,
        {perDay: {total: 0, current: 0}, spells: [
          spell('Magic Missile', {savingThrow: 'none'}),
          spell('Burning Hands', {savingThrow: 'Reflex half'}),
          spell('Grease', {school: 'conjuration'}),
        ]},
      ]}};
      char.feats.push(
        new Feature({name: 'Spell Focus (evocation)', adjustments: {'spellSchoolDcBonus.evocation': 1}}),
        new Feature({name: 'Arcane bond', adjustments: {'spells.wizard.dcBonus': 1}}),
      );
      const wizard = apply(char).spells['wizard'];
      expect(wizard.spells[0].dc).toBe(10 + 0 + 3 + 1);
      expect(wizard.spells[1].dc).toBe(10 + 1 + 3 + 1);
      // magic missile allows no saving throw, so it has no dc. spell focus adds to the evocation that does
      expect(wizard.spells[1].spells.map(s => s.dc)).toEqual([undefined, 15 + 1, 15]);
      expect(wizard.spells[2].dc).toBe(16);
    });

    it('caps the spell level at the casting ability score - 10 and refuses higher spells', () => {
      const char = caster('Wizard', 3, {int: 11});
      char.spells = {wizard: {name: '', ability: '', casterLevel: 0, concentration: 0, spells: [
        undefined as any, undefined as any, {perDay: {total: 0, current: 0}, spells: [spell('Scorching Ray')]},
      ]}};
      const applied = apply(char);
      expect(applied.spells['wizard'].maxSpellLevel).toBe(1);
      const result = service.cast('spells', 'wizard', 2, applied.spells['wizard'].spells[2].spells[0]);
      expect(result.spent).toBeFalse();
      expect(result.reason).toContain('too low');
    });
  });

  describe('prepared casters', () => {
    const wizard = (scores = {int: 14}) => {
      const char = caster('Wizard', 1, scores);
      char.spells = {wizard: {name: '', ability: '', casterLevel: 0, concentration: 0, spells: [
        {perDay: {total: 0, current: 0}, spells: [spell('Light', {components: ['V', 'M']}), spell('Ray of Frost')]},
        {perDay: {total: 0, current: 0}, spells: [
          spell('Magic Missile'), spell('Grease', {school: 'conjuration'}), spell('Charm Person', {school: 'enchantment'}),
        ]},
      ]}};
      return char;
    };

    it('prepares a spell several times up to the slots of the level, and casts the prepared instances', () => {
      apply(wizard());
      // int 14: 1 + 1 first level slots
      expect(service.prepareSpell('wizard', 1, 'Magic Missile')).toBeUndefined();
      expect(service.prepareSpell('wizard', 1, 'Magic Missile')).toBeUndefined();
      expect(service.prepareSpell('wizard', 1, 'Grease')).toBe('no free slot at this level');
      expect(service.applied().spells['wizard'].spells[1].prepared!.length).toBe(2);

      const missile = service.applied().spells['wizard'].spells[1].spells[0];
      expect(service.cast('spells', 'wizard', 1, missile).success).toBeTrue();
      expect(service.applied().spells['wizard'].spells[1].prepared!.map(p => !!p.cast)).toEqual([true, false]);
      expect(service.applied().spells['wizard'].spells[1].perDay.current).toBe(1);
      expect(service.cast('spells', 'wizard', 1, missile).success).toBeTrue();
      expect(service.cast('spells', 'wizard', 1, missile).reason).toBe('not prepared');
      expect(service.applied().spells['wizard'].spells[1].perDay.current).toBe(0);

      const grease = service.applied().spells['wizard'].spells[1].spells[1];
      expect(service.cast('spells', 'wizard', 1, grease).reason).toBe('not prepared');

      service.restCaster('spells', 'wizard');
      expect(service.applied().spells['wizard'].spells[1].perDay.current).toBe(2);
      expect(service.applied().spells['wizard'].spells[1].prepared!.map(p => !!p.cast)).toEqual([false, false]);
    });

    it('casts prepared cantrips at will', () => {
      apply(wizard());
      service.prepareSpell('wizard', 0, 'Light');
      const light = service.applied().spells['wizard'].spells[0].spells[0];
      for (let i = 0; i < 5; i++) expect(service.cast('spells', 'wizard', 0, light).success).toBeTrue();
      expect(service.applied().spells['wizard'].spells[0].perDay.current).toBe(3);
    });

    it('gives a specialist one school slot per level for its school, and opposition spells take two slots', () => {
      const char = wizard({int: 11});
      char.spells['wizard'].school = 'evocation';
      char.spells['wizard'].oppositionSchools = ['enchantment'];
      apply(char);
      const first = service.applied().spells['wizard'].spells[1];
      expect(first.extraSlot).toEqual({kind: 'school', total: 1, current: 1, label: 'school (evocation)'});
      expect(service.applied().spells['wizard'].spells[0].extraSlot).toBeUndefined();
      expect(service.prepareSpell('wizard', 1, 'Grease', 'extra')).toBe('not a school spell');
      expect(service.prepareSpell('wizard', 1, 'Charm Person')).toBe('no free slot at this level');
      expect(service.prepareSpell('wizard', 1, 'Magic Missile', 'extra')).toBeUndefined();
      expect(service.prepareSpell('wizard', 1, 'Magic Missile', 'extra')).toBe('the extra slot is taken');
      expect(service.prepareSpell('wizard', 1, 'Magic Missile')).toBeUndefined();

      const missile = service.applied().spells['wizard'].spells[1].spells[0];
      // the first prepared instance is the school slot
      expect(service.cast('spells', 'wizard', 1, missile).success).toBeTrue();
      expect(service.applied().spells['wizard'].spells[1].extraSlot!.current).toBe(0);
      expect(service.applied().spells['wizard'].spells[1].perDay.current).toBe(1);
      service.restCaster('spells', 'wizard');
      expect(service.applied().spells['wizard'].spells[1].extraSlot!.current).toBe(1);
    });

    it('gives a cleric domain slots for the spells of its domains', () => {
      const char = caster('Cleric', 1, {wis: 11});
      char.spells = {cleric: {name: '', ability: '', casterLevel: 0, concentration: 0, domains: ['Fire'], spells: [
        undefined as any,
        {perDay: {total: 0, current: 0}, spells: [
          spell('Bless', {school: 'enchantment'}), spell('Burning Hands', {domain: 'Fire'}), spell('Obscuring Mist', {domain: 'Water'}),
        ]},
      ]}};
      apply(char);
      expect(service.prepareSpell('cleric', 1, 'Bless', 'extra')).toBe('not a domain spell');
      expect(service.prepareSpell('cleric', 1, 'Obscuring Mist', 'extra')).toBe('not a domain spell');
      expect(service.prepareSpell('cleric', 1, 'Burning Hands', 'extra')).toBeUndefined();
      expect(service.prepareSpell('cleric', 1, 'Bless')).toBeUndefined();
      expect(service.applied().spells['cleric'].spells[1].prepared).toEqual([{name: 'Burning Hands', slot: 'extra'}, {name: 'Bless'}]);
      service.unprepareSpell('cleric', 1, 1);
      expect(service.applied().spells['cleric'].spells[1].prepared!.length).toBe(1);
    });
  });

  describe('spontaneous casters', () => {
    it('cast known spells from the slots the rules gave, cantrips at will, and get them back on a rest', () => {
      const char = caster('Sorcerer', 1, {cha: 11});
      char.spells = {sorcerer: {name: '', ability: '', casterLevel: 0, concentration: 0, spells: [
        {perDay: {total: 0, current: 0}, spells: [spell('Acid Splash', {components: ['V']})]},
        {perDay: {total: 0, current: 0}, spells: [spell('Magic Missile', {components: ['V']})]},
      ]}};
      apply(char);
      const missile = service.applied().spells['sorcerer'].spells[1].spells[0];
      for (let i = 0; i < 3; i++) expect(service.cast('spells', 'sorcerer', 1, missile).success).toBeTrue();
      expect(service.raw().spells['sorcerer'].spells[1].used).toBe(3);
      expect(service.cast('spells', 'sorcerer', 1, missile).reason).toBe('no slot left');
      const splash = service.applied().spells['sorcerer'].spells[0].spells[0];
      expect(service.cast('spells', 'sorcerer', 0, splash).success).toBeTrue();
      service.resetSpellLevel('spells', 'sorcerer', 1);
      expect(service.applied().spells['sorcerer'].spells[1].perDay.current).toBe(3);
    });
  });

  describe('spell failure', () => {
    const armored = (className: string, proficiency: string, chance: number): Character => {
      const char = caster(className, 1, {cha: 12});
      const armor = new Armor();
      armor.equipped = true;
      armor.proficiency = proficiency;
      armor.features = [new Feature({name: 'Armor', adjustments: {arcaneSpellFailureChance: chance}})];
      char.inventory = [armor];
      const origin = className.toLowerCase();
      char.spells = {[origin]: {name: '', ability: '', casterLevel: 0, concentration: 0, spells: [
        undefined as any,
        {perDay: {total: 0, current: 0}, spells: [spell('Grease'), spell('Silent', {components: ['V']})]},
      ]}};
      return char;
    };

    it('rolls d% for a somatic spell of an arcane caster, a failed spell still spends its slot', () => {
      apply(armored('Sorcerer', 'light', 20));
      expect(service.applied().spells['sorcerer'].arcaneSpellFailure).toBe(20);
      const grease = service.applied().spells['sorcerer'].spells[1].spells[0];
      roll = 15;
      const failed = service.cast('spells', 'sorcerer', 1, grease, {onSelf: true});
      expect(failed).toEqual(jasmine.objectContaining({spent: true, success: false, roll: 15, chance: 20, reason: 'spell failure'}));
      expect(service.lastCast()).toEqual(failed);
      expect(service.applied().spells['sorcerer'].spells[1].perDay.current).toBe(3);
      roll = 21;
      expect(service.cast('spells', 'sorcerer', 1, grease).success).toBeTrue();
    });

    it('does not roll for a spell without a somatic component', () => {
      apply(armored('Sorcerer', 'light', 20));
      roll = 1;
      const silent = service.applied().spells['sorcerer'].spells[1].spells[1];
      const result = service.cast('spells', 'sorcerer', 1, silent);
      expect(result.success).toBeTrue();
      expect(result.roll).toBeUndefined();
    });

    it('lets a bard ignore the spell failure of light armor but not of medium armor', () => {
      expect(apply(armored('Bard', 'light', 10)).spells['bard'].arcaneSpellFailure).toBe(0);
      expect(apply(armored('Bard', 'medium', 25)).spells['bard'].arcaneSpellFailure).toBe(25);
    });

    it('has divine casters ignore arcane spell failure, but not the spell failure chance of any caster', () => {
      const char = armored('Bard', 'light', 0);
      char.classLevels = levels('Cleric', 1);
      char.spells = {cleric: char.spells['bard']};
      char.abilityScores.wis = 12;
      char.feats.push(new Feature({name: 'Armor', adjustments: {arcaneSpellFailureChance: 40}}));
      apply(char);
      const grease = service.applied().spells['cleric'].spells[1].spells[0];
      service.prepareSpell('cleric', 1, 'Grease');
      roll = 1;
      expect(service.cast('spells', 'cleric', 1, {...grease}).roll).toBeUndefined();
      service.raw().feats.push(new Feature({name: 'Curse', adjustments: {spellFailureChance: 10}}));
      service.update();
      service.restCaster('spells', 'cleric');
      expect(service.cast('spells', 'cleric', 1, grease)).toEqual(jasmine.objectContaining({roll: 1, chance: 10, success: false}));
    });
  });

  describe('example cleric', () => {
    it('works out the 3rd level cleric of example-cleric.json', () => {
      const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCleric)));
      const cleric = apply(char).spells['cleric'];
      expect(cleric.casterLevel).toBe(3);
      expect(cleric.spells.map(level => level.perDay.total)).toEqual([4, 3, 2]);
      expect(cleric.spells.map(level => level.dc)).toEqual([13, 14, 15]);
      // Spell Focus (evocation) adds to Burning Hands, not to the other 1st-level spells
      expect(cleric.spells[1].spells.map(s => s.dc)).toEqual([undefined, 14, 15]);
      // produce flame is an attack, it allows no saving throw and so has no dc, hold person has the level's
      expect(cleric.spells[2].spells.map(s => s.dc)).toEqual([undefined, 15]);
      // the human's +2 wis keeps her at wis 16, the bonus feat gives her two feats, common is her language
      expect(service.applied().abilityScores.wis).toBe(16);
      expect(service.applied().languagesAllowed).toBe(1);
      expect(cleric.spells[1].extraSlot?.kind).toBe('domain');
      expect(cleric.spells[1].prepared!.length).toBe(4);
      const shield = cleric.spells[1].spells[1];
      expect(service.cast('spells', 'cleric', 1, shield, {onSelf: true}).success).toBeTrue();
      expect(service.applied().ac).toBe(12);
    });
  });
});
