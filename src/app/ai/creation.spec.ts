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
        {name: 'Darkvision', description: '60 ft.', adjustments: {}, descriptionOnly: 'the sheet keeps no senses'},
      ]),
    });
    expect(result.done).toBe('race Dwarf (from memory, check it): Dwarf racial stats, Darkvision');
    expect(service.applied().speed.land).toBe(20);
    expect(service.applied().abilityScores.con).toBe(12);
    expect(status().race).toBe('Dwarf');
    expect(setRace(service, {name: 'Elf', based_on: 'own knowledge', features: '[{"name": "x", "adjustments": {"abilityScores.dex": 2, "speeed.land": 30}}]'}).error)
      .toContain('nothing was changed');
    // nested the way the AI writes it, and with what it wrote after the end of the JSON
    expect(setRace(service, {name: 'Elf', based_on: 'own knowledge', features: '[{"name": "Elf racial stats", "adjustments": {"abilityScores": {"dex": 2, "con": -2}}}],subtype:'}).done)
      .toContain('race Dwarf -> Elf');
    expect(service.applied().abilityScores.dex).toBe(12);
  });

  it('refuses a race whose ability choice was not made (a human\'s +2 to one ability)', () => {
    const human = (stats: object) => setRace(service, {name: 'Human', based_on: 'own knowledge', features: JSON.stringify([
      {name: '+2 to One Ability Score', description: 'one ability of the player\'s choice', adjustments: {}, descriptionOnly: 'in the racial stats'},
      {name: 'Bonus Feat', adjustments: {bonusFeats: 1}},
      {name: 'Skilled', adjustments: {bonusSkillRanks: '{level}'}},
      {name: 'Human racial stats', adjustments: {'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, ...stats}},
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
    addClassLevel(service, {class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, features: 'none', starting_gold: 1});
    service.raw().classLevels[0].startingWealth = 0;
    expect(setCharacterDetails(service, {starting_gold: 200}).done).toBe('set starting gold 200 gp');
    expect(service.raw().classLevels[0].startingWealth).toBe(200);
  });

  it('prices a kit against the starting gold left, and a class without one asks for it', () => {
    const kit = JSON.stringify([{name: 'Longsword', cost_gp: 15}, {name: 'Trail rations', cost_gp: 0.5, quantity: 5}]);
    expect(priceGear(service, {items: kit})).toEqual(jasmine.objectContaining({total: '17.5 gp'}));
    addClassLevel(service, {class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, features: 'none'});
    expect(service.raw().classLevels.length).toBe(0);
    addClassLevel(service, {class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, features: 'none', starting_gold: 175});
    expect(priceGear(service, {items: kit})).toEqual(jasmine.objectContaining({goldLeftNow: '175 gp', goldLeftAfter: '157.5 gp', fits: true}));
    // set already: the gold left is never written over it
    expect(setCharacterDetails(service, {starting_gold: 157.5}).error).toContain('set already (175 gp');
    expect(service.raw().classLevels[0].startingWealth).toBe(175);
  });

  it('keeps a race\'s ability modifiers in its racial stats, wherever the AI wrote them', () => {
    expect(setRace(service, {name: 'Elf', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Elven Immunities', description: 'immune to magic sleep, +2 racial bonus on saves against enchantment',
        adjustments: {'abilityScores.dex': 2, 'abilityScores.int': 2, 'abilityScores.con': -2, 'saves.will[vs. enchantment]': 2}},
    ])}).done).toContain('race Elf');
    const [stats, immunities] = service.raw().race.features;
    expect(stats.name).toBe('Elf Ability Modifiers');
    expect(stats.adjustments).toEqual({'abilityScores.dex': 2, 'abilityScores.int': 2, 'abilityScores.con': -2} as any);
    expect(immunities.adjustments).toEqual({'saves.will[vs. enchantment]': {value: 2, type: 'racial'}} as any);
    expect(service.applied().abilityScores.dex).toBe(12);
  });

  it('prices ammunition by the bundle and the first outfit free', () => {
    const kit = JSON.stringify([{name: 'Crossbow bolts', cost_gp: 1, quantity: 10}, {name: 'Explorer\'s outfit', cost_gp: 10}]);
    const priced = priceGear(service, {items: kit}) as any;
    expect(priced.total).toBe('1 gp');
    expect(priced.pricesCorrected.length).toBe(2);
  });
});
