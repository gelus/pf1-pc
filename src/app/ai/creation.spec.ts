import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { creationStatus, pointBuyTotal, setAbilityScores, setCharacterDetails, setRace, priceGear } from './creation';
import { addClassLevel } from './level-up';
import { createItem } from './builders';

// creating a character from a blank one with the AI's tools
describe('creation', () => {
  let service: ApplyCharacterService;
  const status = () => creationStatus(service) as any;
  const scores = {str: 14, dex: 12, con: 14, int: 10, wis: 12, cha: 8};

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(new Character());
  });

  it('checks a point buy against its points', () => {
    expect(pointBuyTotal(scores)).toBe(5 + 2 + 5 + 0 + 2 - 2);
    expect(setAbilityScores(service, {scores: JSON.stringify(scores), method: 'point buy 15'}).error)
      .toBe('those scores cost 12 points, the point buy is 15: raise some');
    expect(setAbilityScores(service, {scores: JSON.stringify({...scores, str: 16, cha: 7}), method: 'point buy 15'}).done)
      .toBe('ability scores str 16, dex 12, con 14, int 10, wis 12, cha 7 (15-point buy)');
    expect(status().pointBuy).toBe(15);
    expect(setAbilityScores(service, {scores: JSON.stringify({...scores, str: 20}), method: 'point buy 25'}).error)
      .toContain('between 7 and 18');
    expect(setAbilityScores(service, {scores: JSON.stringify({...scores, str: 17}), method: 'rolled'}).done).toContain('str 17');
    expect(setAbilityScores(service, {scores: '{"str": 10}', method: 'rolled'}).error).toContain('dex is missing');
  });

  it('sets a race from its page, with its racial stats applied', () => {
    expect(setRace(service, {name: 'Dwarf', features: '[]', based_on: 'own knowledge'}).error).toContain('racial stats');
    const result = setRace(service, {
      name: 'Dwarf', subtype: 'Humanoid', based_on: 'own knowledge', features: JSON.stringify([
        {name: 'Dwarf racial stats', adjustments: {'abilityScores.con': 2, 'abilityScores.wis': 2, 'abilityScores.cha': -2,
          'speed.land': {value: 20, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Dwarven'}},
        {name: 'Darkvision', description: '60 ft.', adjustments: {senses: 'darkvision 60 ft.'}},
      ]),
    });
    expect(result.done).toBe('race Dwarf (from memory, check it): Dwarf racial stats, Darkvision');
    expect(service.applied().speed.land).toBe(20);
    expect(service.applied().abilityScores.con).toBe(12);
    expect(status().race).toBe('Dwarf');
    expect(setRace(service, {name: 'Elf', based_on: 'own knowledge', features: '[{"name": "x", "adjustments": {"abilityScores.dex": 2, "speeed.land": 30}}]'}).error)
      .toContain('nothing was changed');
    // nested the way the AI writes it, and with what it wrote after the end of the JSON
    expect(setRace(service, {name: 'Elf', based_on: 'own knowledge', features: '[{"name": "Elf racial stats", "adjustments": {"abilityScores": {"dex": 2, "con": -2}, "speed.land": {"value": 30, "mode": "set"}, "size": {"value": 4, "mode": "set"}, "languages": "Common, Elven"}}],subtype:'}).done)
      .toContain('race Dwarf -> Elf');
    expect(service.applied().abilityScores.dex).toBe(12);
  });

  it('refuses a race whose ability choice was not made (a human\'s +2 to one ability)', () => {
    const human = (stats: object) => setRace(service, {name: 'Human', based_on: 'own knowledge', features: JSON.stringify([
      {name: '+2 to One Ability Score', description: 'one ability of the player\'s choice', adjustments: {}, descriptionOnly: 'in the racial stats'},
      {name: 'Bonus Feat', adjustments: {bonusFeats: 1}},
      {name: 'Skilled', adjustments: {bonusSkillRanks: '{level}'}},
      {name: 'Human racial stats', adjustments: {'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common', ...stats}},
    ])});
    expect((human({}) as any).problems[0]).toContain('ask which and adjust that one');
    expect(human({'abilityScores.str': 2}).done).toContain('race Human');
    expect(service.applied().abilityScores.str).toBe(12);
    expect(service.applied().bonusFeats).toBe(1);
    expect(service.applied().bonusSkillRanks).toBe(0);
  });

  it('sets who the character is', () => {
    expect(setCharacterDetails(service, {name: 'Thora', alignment: 'lawful good', deity: 'Torag', favored_classes: 'Fighter'}).done)
      .toBe('set named Thora, LG, deity Torag, favored class Fighter');
    expect(service.raw()).toEqual(jasmine.objectContaining({name: 'Thora', alignment: 'LG', deity: 'Torag', favoredClasses: ['Fighter']}));
    expect(setCharacterDetails(service, {alignment: 'good'}).error).toContain('alignment is one of');
    expect(setCharacterDetails(service, {}).error).toContain('say what to set');
  });

  it('gives the first level the full hit die and its starting wealth, which gear is bought from', () => {
    expect(status().startingWealthLeft).toBe('comes with the first class level');
    expect(addClassLevel(service, {class_name: 'Fighter', features: 'none'}).done).toBe('level 1: Fighter 1');
    expect(service.applied().hp).toBe(10);
    const wealth = status().startingWealthLeft;
    createItem(service, {name: 'Longsword', type: 'weapon', cost_gp: 15, based_on: 'player description', features: '[]', damage: '1d8', critical: '19-20/x2'});
    expect(status().startingWealthLeft).not.toBe(wealth);
    expect(status().startingWealthLeft).toContain('160');
  });

  it('sets the starting gold of a class level that has none', () => {
    addClassLevel(service, {class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, table_row: '{"bab": 1, "fort": 2, "ref": 2, "will": 0}', weapon_proficiencies: 'simple, martial', armor_proficiencies: 'light, medium, shield', features: 'none', starting_gold: 1});
    service.raw().classLevels[0].startingWealth = 0;
    expect(setCharacterDetails(service, {starting_gold: 200}).done).toBe('set starting gold 200 gp');
    expect(service.raw().classLevels[0].startingWealth).toBe(200);
  });

  it('prices a kit against the starting gold left, and a class without one asks for it', () => {
    const kit = JSON.stringify([{name: 'Longsword', cost_gp: 15}, {name: 'Trail rations', cost_gp: 0.5, quantity: 5}]);
    expect(priceGear(service, {items: kit})).toEqual(jasmine.objectContaining({total: '17.5 gp'}));
    addClassLevel(service, {class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, table_row: '{"bab": 1, "fort": 2, "ref": 2, "will": 0}', weapon_proficiencies: 'simple, martial', armor_proficiencies: 'light, medium, shield', features: 'none'});
    expect(service.raw().classLevels.length).toBe(0);
    addClassLevel(service, {class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, table_row: '{"bab": 1, "fort": 2, "ref": 2, "will": 0}', weapon_proficiencies: 'simple, martial', armor_proficiencies: 'light, medium, shield', features: 'none', starting_gold: 175});
    expect(priceGear(service, {items: kit})).toEqual(jasmine.objectContaining({goldLeftNow: '175 gp', goldLeftAfter: '157.5 gp', fits: true}));
    // set already: the gold left is never written over it
    expect(setCharacterDetails(service, {starting_gold: 157.5}).error).toContain('set already (175 gp');
    expect(service.raw().classLevels[0].startingWealth).toBe(175);
  });

  it('keeps a race\'s ability modifiers in its racial stats, wherever the AI wrote them', () => {
    expect(setRace(service, {name: 'Elf', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Elf racial stats', adjustments: {'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Elven'}},
      {name: 'Elven Immunities', description: 'immune to magic sleep, +2 racial bonus on saves against enchantment',
        adjustments: {'abilityScores.dex': 2, 'abilityScores.int': 2, 'abilityScores.con': -2, 'saves.will[vs. enchantment]': 2}},
    ])}).done).toContain('race Elf');
    const [stats, immunities] = service.raw().race.features;
    expect(stats.adjustments).toEqual({'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Elven',
      'abilityScores.dex': 2, 'abilityScores.int': 2, 'abilityScores.con': -2} as any);
    expect(immunities.adjustments).toEqual({'saves.will[vs. enchantment]': {value: 2, type: 'racial'}} as any);
    expect(service.applied().abilityScores.dex).toBe(12);
  });

  it('gives the first outfit free', () => {
    const kit = JSON.stringify([{name: 'Crossbow bolts', cost_gp: 0.1, quantity: 10}, {name: 'Explorer\'s outfit', cost_gp: 10}]);
    const priced = priceGear(service, {items: kit}) as any;
    expect(priced.total).toBe('1 gp');
    expect(priced.pricesCorrected).toEqual([jasmine.stringContaining('the starting outfit is free')]);
  });

  it('refuses a race without its speed, size and languages, or a sense its text gives without "senses"', () => {
    const half = (features: object[]) => setRace(service, {name: 'Half-Orc', based_on: 'own knowledge', features: JSON.stringify(features)}) as any;
    expect(half([{name: 'Half-Orc racial stats', adjustments: {'abilityScores.str': 2}}]).problems.join(' ')).toContain('need speed.land, size, languages');
    const stats = {name: 'Half-Orc racial stats', adjustments: {'abilityScores.str': 2, 'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Orc'}};
    expect(half([stats, {name: 'Darkvision', description: 'see in the dark 60 ft.', adjustments: {}, descriptionOnly: 'a sense'}]).problems.join(' '))
      .toContain('Darkvision: its text gives a sense');
    expect(half([stats, {name: 'Darkvision', description: '60 ft.', adjustments: {senses: 'darkvision 60 ft.'}}]).done).toContain('race Half-Orc');
    expect(service.applied().speed.land).toBe(30);
    expect(service.applied().senses).toContain('darkvision 60 ft.');
  });

  it('refuses a racial trait with neither adjustments nor a description', () => {
    expect((setRace(service, {name: 'Half-Orc', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Half-Orc racial stats', adjustments: {'abilityScores.str': 2}}, {name: 'Orc Ferocity', adjustments: {}}])}) as any).problems.join(' '))
      .toContain('Orc Ferocity: no adjustments and no description');
  });

  it('refuses a vague gear bundle, and says what a kit is missing', () => {
    expect((priceGear(service, {items: JSON.stringify([{name: 'Adventuring Gear Bundle', cost_gp: 0.1}])}) as any).error).toContain('not an item');
    const priced = priceGear(service, {items: JSON.stringify([{name: 'Shortbow', cost_gp: 30}, {name: 'Greatsword', cost_gp: 50}])}) as any;
    expect(priced.missing).toContain('outfit');
    expect((priceGear(service, {items: JSON.stringify([{name: 'Shortbow', cost_gp: 30}, {name: 'Explorer\'s outfit', cost_gp: 0}])}) as any).missing).toBeUndefined();
  });



  it('reads a trait built from memory by its rules, not by the app\'s note on where it came from', () => {
    // "check it against the rules" is the app's, not a situational bonus
    expect(setRace(service, {name: 'Half-Orc', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Half-Orc racial stats', adjustments: {'abilityScores.str': 2, 'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Orc'}},
      {name: 'Intimidating', description: '+2 racial bonus on Intimidate checks.', adjustments: {'skills.intimidate.value': {value: 2, type: 'racial'}}},
    ])}).done).toContain('Intimidating');
  });

  it('takes a trait whose rules are written and give no number as description only, without being told so', () => {
    expect(setRace(service, {name: 'Half-Orc', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Half-Orc racial stats', adjustments: {'abilityScores.str': 2, 'speed.land': {value: 30, mode: 'set'}, size: 'Medium', languages: 'Common, Orc'}},
      {name: 'Orc Blood', description: 'Count as both human and orc for any effect related to race', adjustments: {}},
    ])}).done).toContain('Orc Blood');
    expect(service.applied().size).toBe(4);
    // one that names a bonus is still asked for its numbers
    expect((setRace(service, {name: 'Elf', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Elf racial stats', adjustments: {'abilityScores.dex': 2, 'speed.land': {value: 30, mode: 'set'}, size: 'Medium', languages: 'Common, Elven'}},
      {name: 'Keen Senses', description: 'a racial bonus on Perception checks', adjustments: {}},
    ])}) as any).problems.join(' ')).toContain('Keen Senses adjusts nothing');
  });

  it('shows each racial trait with no number on the sheet, in the list its text points to', () => {
    expect(setRace(service, {name: 'Half-Orc', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Half-Orc racial stats', adjustments: {'abilityScores.str': 2, 'speed.land': {value: 30, mode: 'set'}, size: 'Medium', languages: 'Common, Orc'}},
      {name: 'Darkvision', description: '60 ft.', adjustments: {senses: 'darkvision 60 ft.'}},
      {name: 'Orc Blood', description: 'Count as both human and orc for any effect related to race', adjustments: {}},
      {name: 'Orc Ferocity', description: 'Once per day, when brought below 0 hit points but not killed, fight on for one more round', adjustments: {}},
    ])}).done).toContain('race Half-Orc');
    const applied = service.applied();
    expect(applied.specialQuality.map(e => e.name)).toEqual(['Orc Blood']);
    expect(applied.defensiveAbilities.map(e => e.name)).toEqual(['Orc Ferocity']);
    // one with numbers shows through them, as a stat block has it
    expect(applied.senses).toContain('darkvision 60 ft.');
  });
});
