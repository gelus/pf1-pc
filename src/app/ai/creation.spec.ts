import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { creationStatus, pointBuyTotal, setAbilityScores, setCharacterDetails, setRace } from './creation';
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
        {name: 'Darkvision', description: '60 ft.', adjustments: {}},
      ]),
    });
    expect(result.done).toBe('race Dwarf (from memory, check it): Dwarf racial stats, Darkvision');
    expect(service.applied().speed.land).toBe(20);
    expect(service.applied().abilityScores.con).toBe(12);
    expect(status().race).toBe('Dwarf');
    expect(setRace(service, {name: 'Elf', based_on: 'own knowledge', features: '[{"name": "x", "adjustments": {"abilityScores.dex": 2, "speeed.land": 30}}]'}).error)
      .toContain('nothing was changed');
  });

  it('refuses a race whose ability choice was not made (a human\'s +2 to one ability)', () => {
    const human = (stats: object) => setRace(service, {name: 'Human', based_on: 'own knowledge', features: JSON.stringify([
      {name: '+2 to One Ability Score', description: 'one ability of the player\'s choice', adjustments: {}},
      {name: 'Bonus Feat', adjustments: {bonusFeats: 1}},
      {name: 'Skilled', adjustments: {bonusSkillRanks: '{level}'}},
      {name: 'Human racial stats', adjustments: {'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, ...stats}},
    ])});
    expect(human({}).error).toContain('ask which and adjust that one');
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
    expect(addClassLevel(service, {class_name: 'Fighter', features: '[]'}).done).toBe('level 1: Fighter 1');
    expect(service.applied().hp).toBe(10);
    const wealth = status().startingWealthLeft;
    createItem(service, {name: 'Longsword', type: 'weapon', cost_gp: 15, based_on: 'player description', features: '[]'});
    expect(status().startingWealthLeft).not.toBe(wealth);
    expect(status().startingWealthLeft).toContain('160');
  });
});
