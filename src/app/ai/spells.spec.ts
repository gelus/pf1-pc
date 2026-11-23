import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { PERCENTILE_ROLL } from '../rules/spellcasting';
import { addClassLevel } from './level-up';
import { createFeature } from './builders';
import { checkCreatedCharacter } from './character-check';
import { characterSummary } from './character-reader';
import { addSpells, changeCasterChoices, prepareSpells, removeSpells, setClassSpellcasting, spellcastingFrom } from './spells';
import { aiToolsFor } from './ai-tools';
import { clearLookups } from './rules-lookup';

// the spells of a character built by the AI: any class casts (its own table, or a core one it shares), a caster's
// choices, the spells added, prepared and removed, and the spell-like abilities a feature gives
describe('spells built by the AI', () => {
  let service: ApplyCharacterService;

  const fresh = (scores: {[ability: string]: number}) => {
    const char = new Character();
    char.abilityScores = {str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10, ...scores};
    service.initializeCharacter(JSON.parse(JSON.stringify(char)));
  };

  const spell = (name: string, level: number, school: string, extra: object = {}) => ({
    name, level, school, components: 'V, S', range: 'close', duration: 'instantaneous', saving_throw: 'none',
    spell_resistance: 'yes', description: `${name} in short`, ...extra,
  });

  // an oracle: a class the app has no preset of, with the sorcerer's table
  const oracle = (args: object = {}) => addClassLevel(service, {
    class_name: 'Oracle', hit_die: 8, bab: 'threeQuarters', good_saves: 'will', skill_ranks: 4, starting_gold: 105,
    table_row: '{"bab": 0, "fort": 0, "ref": 0, "will": 2}', weapon_proficiencies: 'simple', armor_proficiencies: 'light, medium, shield',
    class_skills: 'diplomacy,heal,spellcraft', based_on: 'own knowledge',
    features: JSON.stringify([
      {gained_at: 1, name: 'Orisons', description: 'casts a number of orisons, at will', description_only: 'the rules work out its spells'},
      {gained_at: 1, name: 'Mystery (Flame)', description: 'the flame mystery', description_only: 'its revelations are features of their own'},
    ]),
    ...args,
  }) as any;

  const wizard = (args: object = {}) => addClassLevel(service, {
    class_name: 'Wizard', based_on: 'own knowledge',
    features: JSON.stringify([{gained_at: 1, name: 'Arcane School', description: 'a school of magic', description_only: 'its powers are features of their own'}]),
    ...args,
  }) as any;

  beforeEach(() => {
    clearLookups();
    TestBed.configureTestingModule({providers: [{provide: PERCENTILE_ROLL, useValue: () => 100}]});
    service = TestBed.inject(ApplyCharacterService);
  });

  describe('a class that casts', () => {
    it('refuses a class whose features say it casts without its spellcasting, and casts from the table it shares', () => {
      fresh({cha: 16});
      expect(oracle().problems.join(' ')).toContain('Oracle casts spells (its features say so): give "spellcasting"');
      expect(service.raw().classLevels.length).toBe(0);
      const result = oracle({spellcasting: '{"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"}'});
      expect(result.done).toContain('level 1: Oracle 1');
      const caster = service.applied().spells['oracle'];
      expect(caster).toEqual(jasmine.objectContaining({casting: 'spontaneous', arcane: false, casterLevel: 1, ability: 'cha', classTable: 'sorcerer'}));
      // 3 a day + 1 bonus spell of Cha 16, knows 4 orisons and 2 1st-level spells
      expect(caster.spells[1].perDay.total).toBe(4);
      expect(caster.spells[0].known).toBe(4);
      expect(caster.spells[1].known).toBe(2);
      expect(result.stillToDo.join(' ')).toContain('oracle spells to add: 4 level 0, 2 level 1');
    });

    it('casts from a table of its own, read row by row from its page', () => {
      fresh({int: 16});
      const own = '{"ability": "int", "type": "prepared", "magic": "arcane", "spells_per_day": {"1": [3, 1], "2": [4, 2], "3": [4, 3], "4": [4, 3, 1]}}';
      expect(spellcastingFrom('{"ability": "int", "type": "prepared", "magic": "arcane"}', 'Magus', 1).problems.join(' ')).toContain('needs its table');
      expect(spellcastingFrom('{"ability": "int", "type": "prepared", "magic": "arcane", "spells_per_day": {"1": [3, 1], "3": [4, 3]}}', 'Magus', 1).problems.join(' ')).toContain('level 2 is missing');
      const read = spellcastingFrom(own, 'Magus', 1);
      expect(read.spellcasting).toEqual(jasmine.objectContaining({origin: 'magus', perDay: [[3, 1], [4, 2], [4, 3], [4, 3, 1]]}));
      expect(read.notes.join(' ')).toContain('its table has 4 levels');
      expect(addClassLevel(service, {
        class_name: 'Magus', hit_die: 8, bab: 'threeQuarters', good_saves: 'fort,will', skill_ranks: 2, starting_gold: 140,
        table_row: '{"bab": 0, "fort": 2, "ref": 0, "will": 2}', weapon_proficiencies: 'simple, martial', armor_proficiencies: 'light',
        class_skills: 'spellcraft', based_on: 'own knowledge', spellcasting: own,
        features: JSON.stringify([{gained_at: 1, name: 'Spells', description: 'casts arcane spells from a spellbook', description_only: 'the rules work out its spells'}]),
      }).done).toContain('Magus 1');
      const caster = service.applied().spells['magus'];
      expect(caster.classTable).toBe('own');
      // 1 a day and 1 bonus spell of Int 16; its cantrips prepared 3 a day, at will
      expect(caster.spells[1].perDay.total).toBe(2);
      expect(caster.spells[0]).toEqual(jasmine.objectContaining({atWill: true, base: 3}));
      expect(caster.spells[2]).toBeUndefined();
    });

    it('refuses a class feature that adds to its own caster level when its text gives no bonus (CL 2 at wizard 1)', () => {
      fresh({int: 17});
      const problems = wizard({school: 'conjuration', opposition_schools: 'enchantment, necromancy', features: JSON.stringify([
        {gained_at: 1, name: 'Spellcasting (Wizard)', description: 'prepares arcane spells from a spellbook', adjustments: {'spells.wizard.casterLevel': 1}},
      ])}).problems.join(' ');
      expect(problems).toContain('Spellcasting (Wizard): spells.wizard.casterLevel come from the class\'s levels already');
      // a feature whose text gives the bonus keeps it
      expect(wizard({school: 'conjuration', opposition_schools: 'enchantment, necromancy', features: JSON.stringify([
        {gained_at: 1, name: 'Arcane Focus', description: '+1 caster level with conjuration spells', adjustments: {'spells.wizard.casterLevel': 1}},
      ])}).done).toContain('Wizard 1');
    });

    it('asks a specialist for its school and opposition schools, and keeps them on its caster', () => {
      fresh({int: 17});
      expect(wizard().problems.join(' ')).toContain('school: this class specializes in a school of magic');
      expect(wizard({school: 'conjuration'}).problems.join(' ')).toContain('opposition_schools: a conjuration specialist gives up two other schools');
      expect(wizard({school: 'summoning', opposition_schools: 'enchantment, necromancy'}).problems.join(' ')).toContain('school is a school of magic');
      const result = wizard({school: 'Conjuration', opposition_schools: 'enchantment and necromancy'});
      expect(result.done).toContain('Wizard 1');
      const caster = service.applied().spells['wizard'];
      expect(caster.school).toBe('conjuration');
      expect(caster.oppositionSchools).toEqual(['enchantment', 'necromancy']);
      // 1 a day, 1 bonus spell of Int 17, and the school slot
      expect(caster.casterLevel).toBe(1);
      expect(caster.spells[1].perDay.total).toBe(2);
      expect(caster.spells[1].extraSlot).toEqual(jasmine.objectContaining({kind: 'school', total: 1}));
      expect(result.spells.school).toBe('conjuration');
      // the choices change later, one step
      expect((changeCasterChoices(service, {school: 'evocation', opposition_schools: 'evocation, enchantment'}) as any).problems.join(' ')).toContain('opposition_schools can not hold the specialty');
      expect(changeCasterChoices(service, {school: 'evocation', opposition_schools: 'enchantment, conjuration'}).done).toContain('school evocation');
      // a universalist gives up nothing
      fresh({int: 17});
      expect(wizard({school: 'universalist'}).done).toContain('Wizard 1');
      expect(service.applied().spells['wizard'].spells[1].extraSlot).toBeUndefined();
    });

    it('asks a cleric for its domains', () => {
      fresh({wis: 16});
      const cleric = (args: object) => addClassLevel(service, {
        class_name: 'Cleric', based_on: 'own knowledge', features: JSON.stringify([
          {gained_at: 1, name: 'Fire Domain', description: 'the fire domain', description_only: 'its power is its own feature'},
          {gained_at: 1, name: 'Fire Bolt', description: 'ranged touch attack 1d6 + 1 per 2 levels fire damage', description_only: 'no path: its damage is rolled', shown_in: 'specialAttack', uses_by_level: {at: {'1': 3}, plus: 'wis'}},
        ]), ...args,
      }) as any;
      expect(cleric({}).problems.join(' ')).toContain('domains: this class picks domains');
      expect(cleric({domains: 'Fire, Sun'}).done).toContain('Cleric 1');
      expect(service.applied().spells['cleric'].domains).toEqual(['Fire', 'Sun']);
    });

    it('gives a class added without its spellcasting its spells afterwards', () => {
      fresh({cha: 16});
      expect(addClassLevel(service, {
        class_name: 'Oracle', hit_die: 8, bab: 'threeQuarters', good_saves: 'will', skill_ranks: 4, starting_gold: 105,
        table_row: '{"bab": 0, "fort": 0, "ref": 0, "will": 2}', weapon_proficiencies: 'simple', armor_proficiencies: 'light',
        class_skills: 'heal', based_on: 'own knowledge', features: 'none',
      }).done).toContain('Oracle 1');
      expect(service.applied().spells['oracle']).toBeUndefined();
      expect(checkCreatedCharacter(service).errors.join(' ')).not.toContain('casts spells');
      const result = setClassSpellcasting(service, {class_name: 'oracle', spellcasting: '{"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"}'});
      expect(result.done).toBe('Oracle casts spontaneous divine spells with cha');
      expect(service.applied().spells['oracle'].spells[1].known).toBe(2);
      expect(service.history.undoLabel()).toBe('Oracle spellcasting');
    });
  });

  describe('the spells of a caster', () => {
    it('adds the spells a spontaneous caster knows, up to its table\'s count', () => {
      fresh({cha: 16});
      oracle({spellcasting: '{"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"}'});
      const cure = spell('Cure Light Wounds', 1, 'conjuration (healing)', {saving_throw: 'Will half (harmless)'});
      const tooMany = addSpells(service, {spells: JSON.stringify([cure, spell('Bless', 1, 'enchantment'), spell('Shield of Faith', 1, 'abjuration')]), based_on: 'own knowledge'}) as any;
      expect(tooMany.problems.join(' ')).toContain('oracle knows 2 level 1 spells, it has 0: 3 is 1 too many');
      expect(service.raw().spells['oracle']).toBeUndefined();
      expect((addSpells(service, {spells: JSON.stringify([spell('Flame Strike', 5, 'evocation')]), based_on: 'own knowledge'}) as any).problems.join(' '))
        .toContain('oracle casts no level 5 spells yet (its levels: 0, 1)');
      expect((addSpells(service, {spells: JSON.stringify([{name: 'Bless', level: 1}]), based_on: 'own knowledge'}) as any).problems.join(' '))
        .toContain('Bless: school is one of');
      const result = addSpells(service, {spells: JSON.stringify([cure, spell('Bless', 1, 'enchantment', {adjustments: {attackRollBonus: {value: 1, type: 'morale'}}})]), based_on: 'own knowledge'}) as any;
      expect(result.done).toBe('added to oracle: Cure Light Wounds, Bless (from memory, check it)');
      const level = service.applied().spells['oracle'].spells[1];
      expect(level.spells.map(s => s.name)).toEqual(['Cure Light Wounds', 'Bless']);
      expect(level.spells[0]).toEqual(jasmine.objectContaining({school: 'conjuration', subSchool: 'healing', components: ['V', 'S'], spellResistance: true}));
      // its DC: 10 + 1 + Cha 3
      expect(level.spells[0].dc).toBe(14);
      expect(service.history.undoLabel()).toBe('oracle spells: Cure Light Wounds, Bless');
      // a spontaneous caster prepares nothing
      expect((prepareSpells(service, {level: 1, spells: 'Bless'}) as any).error).toContain('casts spontaneously');
      // swapped: one out, one in
      expect(removeSpells(service, {spells: 'Bless'}).done).toBe('removed from oracle: Bless');
      expect(addSpells(service, {spells: JSON.stringify([spell('Shield of Faith', 1, 'abjuration')]), based_on: 'own knowledge'}).done).toContain('Shield of Faith');
    });

    it('keeps a wizard\'s spellbook, prepares its slots, its school slot and its opposition spells', () => {
      fresh({int: 17});
      wizard({school: 'conjuration', opposition_schools: 'enchantment, necromancy'});
      expect(addSpells(service, {caster: 'Wizard', based_on: 'own knowledge', spells: JSON.stringify([
        spell('Acid Splash', 0, 'conjuration (creation)'), spell('Detect Magic', 0, 'divination'), spell('Light', 0, 'evocation'),
        spell('Summon Monster I', 1, 'conjuration (summoning)', {duration: '1 round/level'}), spell('Grease', 1, 'conjuration (creation)'),
        spell('Mage Armor', 1, 'conjuration (creation)', {adjustments: {ac: {value: 4, type: 'armor'}}}), spell('Sleep', 1, 'enchantment (compulsion)'),
      ])}).done).toContain('Summon Monster I');
      expect((prepareSpells(service, {level: 1, spells: 'Fireball'}) as any).error).toContain('Fireball is not on the wizard level 1 list');
      expect((prepareSpells(service, {level: 1, spells: 'Sleep', slot: 'extra'}) as any).error).toContain('can not go in the school slot');
      const prepared = prepareSpells(service, {level: 1, spells: 'Summon Monster I, Mage Armor'}) as any;
      expect(prepared.done).toBe('prepared Summon Monster I, Mage Armor (wizard level 1)');
      expect(prepareSpells(service, {level: 1, spells: 'Grease', slot: 'extra'}).done).toContain('Grease');
      // the 2 regular slots are full, and sleep is of an opposition school: two slots
      expect((prepareSpells(service, {level: 1, spells: 'Sleep', replace: true}) as any).refused).toBeUndefined();
      expect(service.applied().spells['wizard'].spells[1].prepared!.map(p => p.name)).toEqual(['Grease', 'Sleep']);
      expect(prepareSpells(service, {level: 0, spells: 'Acid Splash, Detect Magic, Light'}).done).toContain('Light');
      // the summary shows the book and what is prepared
      const wizardCaster = (characterSummary(service) as any).spellcasting[0];
      expect(wizardCaster.school).toBe('conjuration');
      expect(wizardCaster.levels[1].prepared).toEqual(['Grease (extra slot)', 'Sleep']);
    });

    it('holds the creation\'s check to a caster with spells at each level it casts', () => {
      fresh({int: 17});
      wizard({school: 'universalist'});
      expect(checkCreatedCharacter(service).errors).toContain('wizard has no level 0 spells on its list (add_spells)');
      addSpells(service, {based_on: 'own knowledge', spells: JSON.stringify([spell('Light', 0, 'evocation'), spell('Grease', 1, 'conjuration')])});
      const check = checkCreatedCharacter(service);
      expect(check.errors.join(' ')).not.toContain('wizard has no');
      expect(check.warnings).toContain('wizard has nothing prepared at level 1 (prepare_spells)');
    });

    it('offers the spell tools while creating and while playing', () => {
      for (const mode of ['creation', 'play'] as const) {
        const names = aiToolsFor(mode).map(t => t.name);
        expect(names).toEqual(jasmine.arrayContaining(['add_spells', 'prepare_spells', 'remove_spells', 'set_caster_choices', 'set_class_spellcasting']));
      }
    });
  });

  describe('what a class feature gives', () => {
    it('gives the bonus feat a class names, counted with those allowed, and leaves a picked one to pick', () => {
      fresh({int: 17});
      const result = wizard({school: 'universalist', features: JSON.stringify([
        {gained_at: 1, name: 'Scribe Scroll', description: 'a wizard gains Scribe Scroll as a bonus feat', adjustments: {bonusFeats: 1}},
      ])});
      expect(result.done).toContain('Scribe Scroll');
      expect(service.applied().feats.map(f => f.name)).toEqual(['Scribe Scroll']);
      // one feat of the 1st level is left to pick, and the check counts the given one
      expect(result.stillToDo.join(' ')).toContain('1 feat to pick');
      expect(checkCreatedCharacter(service).errors).toContain('1 of 2 feats are not taken');
      // a fighter's bonus feat is the player's pick
      fresh({str: 16});
      addClassLevel(service, {class_name: 'Fighter', based_on: 'own knowledge', features: JSON.stringify([
        {gained_at: 1, name: 'Bonus Feat', description: 'a combat feat of the player\'s choice', adjustments: {bonusFeats: 1}},
      ])});
      expect(service.applied().feats).toEqual([]);
    });

    it('refuses class skills a text gives that no path makes class skills', () => {
      fresh({cha: 16});
      const mystery = (adjustments: object) => oracle({
        spellcasting: '{"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"}',
        features: JSON.stringify([
          {gained_at: 1, name: 'Orisons', description: 'casts orisons at will', description_only: 'the rules work out its spells'},
          {gained_at: 1, name: 'Mystery (Flame)', description: 'Class skills: Acrobatics, Climb, Intimidate and Perception.', adjustments},
        ]),
      });
      expect(mystery({}).problems.join(' ')).toContain('a class skill it gives is "skills.<skill>.classSkill": true');
      expect(mystery({'skills.acrobatics.classSkill': true}).problems.join(' ')).toContain('its text makes climb, intimidate, perception class skills');
      expect(mystery({'skills.acrobatics.classSkill': true, 'skills.climb.classSkill': true, 'skills.intimidate.classSkill': true, 'skills.perception.classSkill': true}).done).toContain('Oracle 1');
      expect(service.applied().skills['perception'].classSkill).toBeTrue();
    });
  });

  describe('spell-like abilities a feature gives', () => {
    const darkness = spell('Darkness', 2, 'evocation', {components: 'V, M/DF', uses: 1, range: 'touch', duration: '1 min./level'});

    it('refuses a feature whose text gives spell-like abilities without them, not one that only names them', () => {
      fresh({cha: 12});
      const result = createFeature(service, {list: 'traits', name: 'Spell-Like Ability', description: 'darkness once per day as a spell-like ability', adjustments: '{}', based_on: 'own knowledge'}) as any;
      expect(result.problems.join(' ')).toContain('its text gives spell-like abilities, which the sheet keeps and counts');
      expect(createFeature(service, {list: 'traits', name: 'Hardy', description: '+2 on saves vs. poison and spell-like abilities', adjustments: '{"savingThrowBonus[vs. poison and spell-like abilities]": 2}', based_on: 'own knowledge'}).done).toContain('Hardy');
    });

    it('keeps them on the feature, each with its uses a day, at the character\'s level, spent as cast and back after a rest', () => {
      fresh({cha: 12});
      const result = createFeature(service, {
        list: 'traits', name: 'Spell-Like Ability', description: 'darkness once per day as a spell-like ability', adjustments: '{}',
        based_on: 'own knowledge', spell_like_abilities: JSON.stringify([darkness, spell('Light', 0, 'evocation', {uses: 'at will'})]),
        spell_like_ability: 'cha', spell_like_caster_level: 'level',
      }) as any;
      expect(result.done).toContain('Spell-Like Ability');
      addClassLevel(service, {class_name: 'Fighter', based_on: 'own knowledge', features: JSON.stringify([{gained_at: 1, name: 'Bonus Feat', description: 'a combat feat', adjustments: {bonusFeats: 1}}])});
      const caster = service.applied().spellLikeAbilities['spell-like ability'];
      expect(caster.casterLevel).toBe(1);
      expect(caster.spells[2].spells[0]).toEqual(jasmine.objectContaining({name: 'Darkness', uses: jasmine.objectContaining({total: 1, current: 1})}));
      expect(caster.spells[0].spells[0].uses).toBeUndefined();
      // its DC uses Cha: 10 + 2 + 1 (none: darkness allows no save)
      expect(caster.spells[2].dc).toBe(13);
      const cast = () => service.cast('spellLikeAbilities', 'spell-like ability', 2, caster.spells[2].spells[0]);
      expect(cast().success).toBeTrue();
      expect(service.applied().spellLikeAbilities['spell-like ability'].spells[2].spells[0].uses!.current).toBe(0);
      expect(cast().reason).toBe('no uses left');
      service.rest({kind: 'night'});
      expect(service.applied().spellLikeAbilities['spell-like ability'].spells[2].spells[0].uses!.current).toBe(1);
      // at will: cast as often as wanted
      const light = service.applied().spellLikeAbilities['spell-like ability'].spells[0].spells[0];
      expect(service.cast('spellLikeAbilities', 'spell-like ability', 0, light).success).toBeTrue();
      expect(service.cast('spellLikeAbilities', 'spell-like ability', 0, light).success).toBeTrue();
    });
  });
});
