import { favoredClassOptionFrom } from './favored-class';
import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { validateAdjustments } from '../rules/adjustment-schema';
import { Character } from '../utils/character.class';
import { AiPageResult, AiProvider } from './ai-provider';
import { createFeature, createItem, createItems } from './builders';
import { addClassLevel, setFavoredClassBonus } from './level-up';
import { aiToolByName } from './ai-tools';
import { setRace } from './creation';
import { missingRacialTraits } from './page-facts';
import { clearLookups, lookUpRule } from './rules-lookup';

// the fixes from the audit of two created casters (a gnome wizard, a tiefling oracle) that are not about spells
describe('fixes from the audit of two created casters', () => {
  let service: ApplyCharacterService;
  const reader = (answer: string): AiProvider => ({
    name: 'fake',
    startSession: () => ({send: async () => ({text: '', toolCalls: []})}),
    readPages: async (request): Promise<AiPageResult> => ({text: answer, pages: request.urls.map(url => ({url, read: true}))}),
  });

  beforeEach(() => {
    clearLookups();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    const char = new Character();
    char.abilityScores = {str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 10};
    service.initializeCharacter(JSON.parse(JSON.stringify(char)));
  });

  it('refuses a bonus on a skill family itself, pointing to its specialty', () => {
    const problems = validateAdjustments({'skills.craft.value': 2});
    expect(problems[0].message).toContain('craft is a family of skills: a bonus goes on its specialty, skills.craft.subSkills.alchemy.value');
    expect(validateAdjustments({'skills.craft.subSkills.alchemy.value': 2})).toEqual([]);
    expect(validateAdjustments({'skills.knowledge.subSkills.*.value': 1})).toEqual([]);
  });

  it('refuses clothing typed as armor, and a melee weapon with no handedness', () => {
    const outfit = createItem(service, {name: 'Explorer\'s outfit', type: 'armor', armor_category: 'light', features: '[]', based_on: 'own knowledge'}) as any;
    expect(outfit.problems.join(' ')).toContain('clothing and an outfit are type other, slot body');
    const spear = (extra: object) => createItem(service, {name: 'Spear', type: 'weapon', damage: '1d8', critical: 'x3', attack_kind: 'melee', features: '[]', based_on: 'own knowledge', ...extra}) as any;
    expect(spear({}).problems.join(' ')).toContain('Spear: handedness from its page\'s weapon table');
    expect(spear({handedness: 'two-handed'}).done).toContain('Spear');
    const attack = (service.raw().inventory[0].features[0].adjustments as any).melee[0];
    expect(attack.hand).toBe('two-handed');
    expect(createItem(service, {name: 'Dagger', type: 'weapon', damage: '1d4', critical: '19-20/x2', attack_kind: 'melee', handedness: 'light', features: '[]', based_on: 'own knowledge'}).done).toContain('Dagger');
    expect((service.raw().inventory[1].features[0].adjustments as any).melee[0].light).toBeTrue();
  });

  it('applies the bonuses of an entry a feature gives in the defensive abilities, not the character\'s own entries there', () => {
    const base = Number(service.applied().ac);
    const raw = service.raw();
    raw.feats.push(new Feature({name: 'Shield Stance', description: '', adjustments: {
      defensiveAbilities: {name: 'Shield Stance', description: 'on in the stance', active: true, adjustments: {ac: {value: 2, type: 'dodge'}}},
    }}));
    // an older character's copy of a class feature, kept for show
    raw.specialQuality = [new Feature({name: 'Copy', description: '', adjustments: {ac: 5}})];
    service.update();
    expect(service.applied().ac).toBe(base + 2);
    expect(service.adjustmentsMap['ac'].some(e => e.origin === 'Shield Stance')).toBeTrue();
    expect(service.adjustmentsMap['ac'].some(e => e.origin === 'Copy')).toBeFalse();
  });

  it('asks for every standard racial trait the race page lists, or the alternate one replacing it', async () => {
    expect(missingRacialTraits({'racial traits': 'Ability Score Racial Traits, Size, Gnome Magic, Obsessive, Weapon Familiarity, Languages'},
      [{name: 'Gnome Magic'}, {name: 'Alchemist', description: '+2 Craft (alchemy); replaces Obsessive'}])).toEqual(['Weapon Familiarity']);
    await lookUpRule(reader('FOUND https://aonprd.com/RacesDisplay.aspx?ItemName=Gnome\n- small\nFACT: racial traits = Gnome Magic, Obsessive, Weapon Familiarity'), {name: 'Gnome', kind: 'race'});
    const result = setRace(service, {
      name: 'Gnome', based_on: 'looked up', source_url: 'https://aonprd.com/RacesDisplay.aspx?ItemName=Gnome',
      features: JSON.stringify([
        {name: 'Racial Stats', adjustments: {'speed.land': {value: 20, mode: 'set'}, size: {value: 3, mode: 'set'}, languages: 'Common, Gnome', 'abilityScores.con': 2}},
        {name: 'Gnome Magic', description: '+1 DC of illusion spells', adjustments: {'spellSchoolDcBonus.illusion': 1}},
      ]),
    }) as any;
    expect(result.problems.join(' ')).toContain('its page (as read) lists Obsessive, Weapon Familiarity as racial traits, and no trait here has that name');
  });

  it('points more rounds or points of a feature a favored class bonus gives to extraUses (a half-orc barbarian\'s rage)', () => {
    const rage = favoredClassOptionFrom({class: 'Barbarian', description: 'Add +1 round of rage per day', adjustments: '{}'});
    expect(rage.problems.join(' ')).toContain('"extraUses.<its name>"');
    const grit = favoredClassOptionFrom({class: 'Gunslinger', description: 'Add +1/4 to the gunslinger\'s grit points', adjustments: {}});
    expect(grit.problems.join(' ')).toContain('"extraUses.<its name>"');
    const skill = favoredClassOptionFrom({class: 'Rogue', description: 'Add +1 to the rogue\'s skill points', adjustments: {}});
    expect(skill.problems.join(' ')).not.toContain('extraUses');
    expect(favoredClassOptionFrom({class: 'Barbarian', description: 'Add +1 round of rage per day', adjustments: {'extraUses.rage': 1}}).option)
      .toBeTruthy();
  });

  it('takes a racial trait named after the stat it is wherever it was written (a half-orc\'s darkvision in its racial stats)', () => {
    const facts = {'racial traits': 'Size, Speed, Darkvision, Intimidating, Low-Light Vision'};
    expect(missingRacialTraits(facts, [
      {name: 'Half-Orc Racial Stats', adjustments: {'speed.land': 30, 'senses.darkvision': 60}},
      {name: 'Intimidating', adjustments: {'skills.intimidate.value': 2}},
    ])).toEqual(['Low-Light Vision']);
  });

  it('checks a feat against the prerequisites its page was read to give, not the AI\'s', async () => {
    await lookUpRule(reader('FOUND https://aonprd.com/FeatDisplay.aspx?ItemName=Extra%20Revelation\n- one more revelation\nFACT: prerequisites = none'), {name: 'Extra Revelation', kind: 'feat'});
    const result = createFeature(service, {
      list: 'feats', name: 'Extra Revelation', description: 'gain one more revelation', description_only: 'its revelation is a feature of its own',
      adjustments: '{}', prerequisites: 'Oracle level 7', based_on: 'looked up', source_url: 'https://aonprd.com/FeatDisplay.aspx?ItemName=Extra%20Revelation',
    }) as any;
    expect(result.done).toContain('Extra Revelation');
    expect(result.prerequisites).toContain('checked against its page\'s (as read): none');
  });
});

// the fixes from the audit of a created dhampir evoker (Vladislaus Drask)
describe('fixes from the audit of a dhampir wizard', () => {
  let service: ApplyCharacterService;
  const reader = (answer: string): AiProvider => ({
    name: 'fake',
    startSession: () => ({send: async () => ({text: '', toolCalls: []})}),
    readPages: async (request): Promise<AiPageResult> => ({text: answer, pages: request.urls.map(url => ({url, read: true}))}),
  });
  const wizard = (args: object = {}) => addClassLevel(service, {
    class_name: 'Wizard', school: 'universalist', based_on: 'own knowledge', favored_class_bonus: 'hp',
    features: JSON.stringify([{gained_at: 1, name: 'Arcane Bond', description: 'a bonded object', description_only: 'its use is judged at the table'}]),
    ...args,
  }) as any;

  beforeEach(() => {
    clearLookups();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    const char = new Character();
    char.abilityScores = {str: 7, dex: 15, con: 13, int: 18, wis: 11, cha: 7};
    service.initializeCharacter(JSON.parse(JSON.stringify(char)));
  });

  it('asks the 1st level for its favored class bonus, and changes one a level has', () => {
    service.raw().creation = {step: 'class', decisions: {}} as any;
    expect(wizard({favored_class_bonus: undefined}).problems.join(' ')).toContain('favored_class_bonus: the 1st level makes Wizard the favored class');
    expect(wizard().done).toContain('Wizard 1');
    const hp = service.applied().hp;
    expect(setFavoredClassBonus(service, {level: 1, favored_class_bonus: 'skill'}).done).toContain('+1 skill rank');
    expect(service.applied().hp).toBe(hp - 1);
    // adding the 1st level again is a 2nd: told how to change the 1st instead
    expect(wizard({rolled_hp: 4, features: JSON.stringify([{gained_at: 1, name: 'Arcane Bond', description: 'x', description_only: 'y'}])}).problems.join(' '))
      .toContain('to change Wizard 1 use set_favored_class_bonus');
  });

  it('gives a caster level bonus to concentration too, and holds a bonus its text caps at Hit Dice to a formula', () => {
    wizard();
    const knack = (adjustments: object) => createFeature(service, {list: 'traits', name: 'Magical Knack', based_on: 'own knowledge',
      description: '+2 caster level with wizard spells; it cannot exceed your Hit Dice', adjustments: JSON.stringify(adjustments)}) as any;
    expect(knack({'spells.wizard.casterLevel': 2}).problems.join(' ')).toContain('its text caps it at the character\'s Hit Dice');
    expect(knack({'spells.wizard.casterLevel': {value: 'min(2, {level} - {level.wizard})', type: 'trait'}}).done).toContain('Magical Knack');
    expect(service.applied().spells['wizard'].casterLevel).toBe(1);
    createFeature(service, {list: 'conditions', name: 'Heightened Focus', based_on: 'own knowledge', description: '+2 caster level', adjustments: '{"spells.wizard.casterLevel": 2}'});
    expect(service.applied().spells['wizard'].casterLevel).toBe(3);
    expect(service.applied().spells['wizard'].concentration).toBe(3);
  });

  it('points a caster field written without its caster to the right path, and keeps negative energy', () => {
    expect(validateAdjustments({'spells.concentration': 2})[0].message).toContain('every caster\'s is spells.*.concentration');
    expect(validateAdjustments({'energyResistance.negative': 5})).toEqual([]);
  });

  it('refuses a racial trait written twice, and takes the AI at its word on one the page does not have', async () => {
    await lookUpRule(reader('FOUND https://aonprd.com/RacesDisplay.aspx?ItemName=Dhampir\n- notes\nFACT: racial traits = Undead Resistance, Manipulate Flame'), {name: 'Dhampir', kind: 'race'});
    const race = (extra: object) => setRace(service, {name: 'Dhampir', based_on: 'looked up', source_url: 'https://aonprd.com/RacesDisplay.aspx?ItemName=Dhampir', ...extra,
      features: JSON.stringify([
        {name: 'Racial Stats', adjustments: {'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common', 'abilityScores.dex': 2}},
        {name: 'Undead Resistance', description: '+2 racial on saves vs. disease', adjustments: {'savingThrowBonus[vs. disease]': {value: 2, type: 'racial'}}},
        {name: 'Dhampir Resistance', description: '+2 racial on saves vs. disease', adjustments: {'savingThrowBonus[vs. disease]': {value: 2, type: 'racial'}}},
      ])}) as any;
    const problems = race({}).problems.join(' ');
    expect(problems).toContain('Dhampir Resistance adjusts exactly what Undead Resistance does');
    expect(problems).toContain('look_up_rules with focus "Manipulate Flame"');
    expect(race({not_on_page: 'Manipulate Flame'}).problems.join(' ')).not.toContain('Manipulate Flame');
  });

  it('puts a drawback with the drawbacks, and a race trait with its race', async () => {
    service.raw().race = {name: 'Dhampir', subtype: '', features: []};
    await lookUpRule(reader('FOUND https://aonprd.com/TraitDisplay.aspx?ItemName=Attached\n- a penalty\nFACT: category = Drawback\nFACT: prerequisites = none'), {name: 'Attached', kind: 'trait'});
    await lookUpRule(reader('FOUND https://aonprd.com/TraitDisplay.aspx?ItemName=Forlorn\n- +1 Will\nFACT: category = Race\nFACT: prerequisites = Elf'), {name: 'Forlorn', kind: 'trait'});
    const add = (name: string, list: string) => createFeature(service, {list, name, based_on: 'looked up', source_url: `https://aonprd.com/TraitDisplay.aspx?ItemName=${name}`,
      description: '-1 on Will saves when what you are attached to is threatened', adjustments: '{"saves.will[its attachment threatened]": -1}'}) as any;
    expect(add('Attached', 'traits').error).toContain('Attached is a drawback (its page): add it in drawbacks');
    expect(add('Attached', 'drawbacks').done).toContain('Attached');
    expect(add('Forlorn', 'traits').error).toContain('a race trait of Elf (its page), the character is a Dhampir');
  });

  it('stops a turn of guessed lookups with how to find a rule by what it does', async () => {
    const tool = aiToolByName('look_up_rules')!;
    const context = {character: service, provider: reader('NOT FOUND'), conversation: {playerTurns: 7}};
    for (let i = 0; i < 6; i++) expect((await tool.run({name: `Trait ${i}`, kind: 'trait'}, context) as any).error).not.toContain('lookups this turn');
    expect((await tool.run({name: 'Trait 7', kind: 'trait'}, context) as any).error).toContain('6 lookups this turn already: stop guessing names');
    expect((await tool.run({name: 'Trait 8', kind: 'trait'}, {...context, conversation: {playerTurns: 8}}) as any).error).toBeUndefined();
  });

  it('equips what a character wears and wields as its kit is bought while creating', () => {
    service.raw().creation = {step: 'equipment', decisions: {}} as any;
    createItems(service, {based_on: 'own knowledge', items: JSON.stringify([
      {name: 'Dagger', type: 'weapon', cost_gp: 2, weight: 1, damage: '1d4', critical: '19-20/x2', attack_kind: 'melee', handedness: 'light'},
      {name: 'Explorer\'s outfit', type: 'other', cost_gp: 0, weight: 8, slot: 'body'},
      {name: 'Bedroll', type: 'other', cost_gp: 0.1, weight: 5},
      {name: 'Spellbook', type: 'other', cost_gp: 15, weight: 3, equipped: false, slot: 'held'},
    ])});
    const equipped = (name: string) => service.raw().inventory.find(i => i.name === name)!.equipped;
    expect([equipped('Dagger'), equipped('Explorer\'s outfit'), equipped('Bedroll'), equipped('Spellbook')]).toEqual([true, true, false, false]);
    expect(service.applied().melee.map(a => a.name)).toContain('Dagger');
  });

  it('checks a class option against the page it was looked up on', async () => {
    await lookUpRule(reader('FOUND https://aonprd.com/SchoolDisplay.aspx?ItemName=Evocation\n- Force Missile (Sp): a missile of force, 3 + your Intelligence modifier times per day'), {name: 'Evocation', kind: 'arcane school'});
    const result = addClassLevel(service, {class_name: 'Wizard', school: 'evocation', opposition_schools: 'enchantment, necromancy', based_on: 'own knowledge', favored_class_bonus: 'hp',
      features: JSON.stringify([{gained_at: 1, name: 'Evocation School', description: 'the evocation school', description_only: 'its powers are judged at the table'}])}) as any;
    expect(result.problems.join(' ')).toContain('Evocation School: its text gives uses a day');
  });
});
