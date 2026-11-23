import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { AiPageResult, AiProvider } from './ai-provider';
import { addClassLevel } from './level-up';
import { averageWealth, pageFactProblems } from './page-facts';
import { clearLookups, factsOf, lookUpRule, pageFactsFor } from './rules-lookup';

// a class level held against the facts its page was read to give
describe('page facts', () => {
  const oraclePage = [
    'FOUND https://aonprd.com/ClassDisplay.aspx?ItemName=Oracle',
    '- revelations, a mystery and a curse at 1st level',
    'FACT: hit die = d8',
    'FACT: skill ranks = 4',
    'FACT: starting wealth = 3d6 x 10 gp',
    'FACT: class skills = Craft (Int), Diplomacy (Cha), Heal (Wis), Knowledge (history) (Int), Knowledge (planes) (Int), Knowledge (religion) (Int), Profession (Wis), Sense Motive (Wis), Spellcraft (Int)',
    'FACT: weapon proficiencies = all simple weapons',
    'FACT: armor proficiencies = light armor, medium armor, shields (except tower shields)',
    'FACT: alignment = any',
  ].join('\n');
  const reader = (answer: string): AiProvider => ({
    name: 'fake',
    startSession: () => ({send: async () => ({text: '', toolCalls: []})}),
    readPages: async (request): Promise<AiPageResult> => ({text: answer, pages: request.urls.map(url => ({url, read: true}))}),
  });

  beforeEach(() => clearLookups());

  it('reads the facts lines of a class page apart from its notes', async () => {
    expect(factsOf(['FACT: hit die = d8', '* FACT: **skill ranks** = 4', 'FACT: nonsense = 3'])).toEqual({'hit die': 'd8', 'skill ranks': '4'});
    const found = await lookUpRule(reader(oraclePage), {name: 'Oracle', kind: 'class'});
    expect(found.text).toBe('- revelations, a mystery and a curse at 1st level');
    expect(pageFactsFor('https://aonprd.com/ClassDisplay.aspx?ItemName=Oracle')?.['hit die']).toBe('d8');
    expect(pageFactsFor(undefined, 'Oracle')?.['starting wealth']).toBe('3d6 x 10 gp');
  });

  it('works out the average starting wealth a page gives', () => {
    expect(averageWealth('3d6 x 10 gp')).toBe(105);
    expect(averageWealth('5d6 × 10 gp (average 175 gp)')).toBe(175);
    expect(averageWealth('2d6 x 10')).toBe(70);
  });

  it('tells each fact the AI gave that the page does not', () => {
    const facts = factsOf(oraclePage.split('\n'));
    const problems = pageFactProblems(facts, {
      hitDie: 8, skillRanks: 4, startingGold: 75,
      classSkills: ['craft', 'heal', 'knowledge (history)', 'knowledge (planes)', 'knowledge (religion)', 'profession', 'ride', 'sense motive', 'spellcraft'],
      proficiencies: {weapons: ['simple', 'martial'], armor: ['light', 'medium', 'shield']},
    }).join(' ');
    expect(problems).toContain('starting_gold: its page (as read) gives 3d6 x 10 gp (105 gp on average), not 75 gp');
    expect(problems).toContain('add diplomacy, leave out ride');
    expect(problems).toContain('weapon_proficiencies: its page (as read) gives "all simple weapons"');
    expect(problems).not.toContain('armor_proficiencies');
    expect(problems).not.toContain('hit_die');
    expect(pageFactProblems(facts, {
      hitDie: 8, skillRanks: 4, startingGold: 105, proficiencies: {weapons: ['simple'], armor: ['light', 'medium', 'shield']},
      classSkills: ['craft', 'diplomacy', 'heal', 'knowledge (history)', 'knowledge (planes)', 'knowledge (religion)', 'profession', 'sense motive', 'spellcraft'],
    })).toEqual([]);
  });

  it('refuses a class level that disagrees with its page\'s facts', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(new Character())));
    await lookUpRule(reader(oraclePage), {name: 'Oracle', kind: 'class'});
    const result = addClassLevel(service, {
      class_name: 'Oracle', hit_die: 8, bab: 'threeQuarters', good_saves: 'will', skill_ranks: 4, starting_gold: 75,
      table_row: '{"bab": 0, "fort": 0, "ref": 0, "will": 2}', weapon_proficiencies: 'simple, martial', armor_proficiencies: 'light, medium, shield',
      class_skills: 'craft,diplomacy,heal,knowledge (history),knowledge (planes),knowledge (religion),profession,sense motive,spellcraft',
      based_on: 'looked up', source_url: 'https://aonprd.com/ClassDisplay.aspx?ItemName=Oracle', features: 'none',
    }) as any;
    expect(result.problems.join(' ')).toContain('starting_gold: its page (as read) gives');
    expect(result.problems.join(' ')).toContain('weapon_proficiencies');
    expect(service.raw().classLevels.length).toBe(0);
  });
});
