import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import example from '../example-character.json';
import { featureKey } from '../utils/classlevel.class';
import { checkCreationStep } from './character-check';
import { addClassLevel, levelUpStatus } from './level-up';
import { clearLookups, lookUpRule } from './rules-lookup';
import { setClassSpellcasting } from './spells';
import { racialTraitProblems } from './page-facts';
import { setRace } from './creation';

// archetypes taken with a class level (add_class_level archetypes), on the example barbarian (Rage, Totem Magic and
// Fast Movement at 1st level)
describe('archetypes', () => {
  let service: ApplyCharacterService;
  const rager = (extra: object = {}) => JSON.stringify([{name: 'Barbarian Invulnerable Rager', replaces: ['Uncanny Dodge', 'Improved Uncanny Dodge', 'Trap Sense'], ...extra}]);
  const invulnerability = '[{"name": "Invulnerability", "gained_at": 2, "description": "DR 1/-", "adjustments": {"damageReduction.-": 1}}]';
  const level = (args: object) => addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 7, based_on: 'player description', ...args}) as any;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
  });
  afterEach(() => clearLookups());

  it('names a class feature the way archetypes and class tables do', () => {
    expect(featureKey('Bravery +1')).toBe(featureKey('bravery'));
    expect(featureKey('Rage Powers')).toBe(featureKey('rage power'));
    expect(featureKey('Uncanny Dodge (Ex)')).toBe('uncanny dodge');
    expect(featureKey('Sneak Attack +1d6')).toBe('sneak attack');
    expect(featureKey('Improved Uncanny Dodge')).not.toBe(featureKey('Uncanny Dodge'));
  });

  it('is taken with a level, keeps the class feature it replaces out of that level and the later ones', () => {
    // the replaced feature given at the level the archetype is taken at
    const refused = level({archetypes: rager(), features: '[{"name": "Uncanny Dodge", "gained_at": 2, "description": "not caught flat-footed", "adjustments": {"defensiveAbilities": {"name": "Uncanny Dodge"}}}]'});
    expect(refused.problems.join(' ')).toContain('Uncanny Dodge is replaced by the Invulnerable Rager archetype');
    expect(service.raw().classLevels.length).toBe(1);

    const added = level({archetypes: rager(), features: invulnerability});
    expect(added.done).toContain('Barbarian 2 (Invulnerable Rager)');
    expect(service.raw().classLevels[1].archetypes).toEqual([jasmine.objectContaining({name: 'Invulnerable Rager'})]);
    expect((levelUpStatus(service) as any).archetypes).toEqual({Barbarian: [jasmine.objectContaining({name: 'Invulnerable Rager', replaces: ['Uncanny Dodge', 'Improved Uncanny Dodge', 'Trap Sense']})]});

    // a later level of the class leaves it out too
    const later = level({features: '[{"name": "Trap Sense +1", "gained_at": 3, "description": "+1 reflex vs traps", "adjustments": {"saves.ref[vs. traps]": 1}}]'});
    expect(later.problems.join(' ')).toContain('Trap Sense +1 is replaced by the Invulnerable Rager archetype');
  });

  it('is taken before the class features it trades are gained', () => {
    const result = level({archetypes: JSON.stringify([{name: 'Swift', replaces: ['Fast Movement']}]), features: 'none'});
    expect(result.problems.join(' ')).toContain('which the character gained at Barbarian 1');
  });

  it('can not trade a class feature another archetype of the class trades', () => {
    expect(level({archetypes: rager(), features: invulnerability}).done).toBeDefined();
    const result = level({
      archetypes: JSON.stringify([{name: 'Wild Rager', alters: ['Uncanny Dodge']}]),
      features: '[]',
    });
    expect(result.problems.join(' ')).toContain('Wild Rager and Invulnerable Rager both replace or alter Uncanny Dodge');
  });

  it('needs what it trades, and changes the proficiencies only at the class\'s 1st level', () => {
    const result = level({archetypes: '[{"name": "Vague", "proficiencies": {"remove": {"armor": ["medium"]}}}]', features: 'none'});
    const problems = result.problems.join(' ');
    expect(problems).toContain('give "replaces"');
    expect(problems).toContain('it is taken at the class\'s 1st level');
  });

  it('changes the class skills of every level of the class, the earlier ones as copies', () => {
    const first = service.raw().classLevels[0];
    expect(level({archetypes: rager({class_skills: {add: ['diplomacy'], remove: ['ride']}}), features: invulnerability}).done).toBeDefined();
    for (const entry of service.raw().classLevels) {
      expect(entry.classSkills).toContain('diplomacy');
      expect(entry.classSkills).not.toContain('ride');
    }
    expect(first.classSkills).toContain('ride');
    expect(service.applied().skills['diplomacy'].classSkill).toBeTrue();
    service.undo();
    expect(service.raw().classLevels[0].classSkills).toContain('ride');
  });

  it('is held to what its page was read to replace', async () => {
    const page = 'https://aonprd.com/ArchetypeDisplay.aspx?FixedName=Barbarian%20Invulnerable%20Rager';
    let asked = '';
    await lookUpRule({name: 'fake', startSession: () => ({}) as any, readPages: async ({instructions}) => {
      asked = instructions;
      return {pages: [], text: `FOUND ${page}\n**Invulnerability:** DR\nFACT: replaced features = uncanny dodge, improved uncanny dodge, trap sense, damage reduction`};
    }}, {name: 'Barbarian Invulnerable Rager', kind: 'archetype'});
    expect(asked).toContain('FACT: replaced features');
    const result = level({archetypes: rager({source_url: page}), features: invulnerability});
    expect(result.problems.join(' ')).toContain('replaces or alters damage reduction too');
  });

  it('is checked by the character check: no class feature an archetype replaced', () => {
    service.update({classLevels: [{...service.raw().classLevels[0], archetypes: [{name: 'Swift', replaces: ['Fast Movement']}]}]});
    expect(checkCreationStep(service, 'class').errors.join(' ')).toContain('Fast Movement is replaced by the Swift archetype');
  });
});

// an archetype that changes how its class casts, on the example barbarian multiclassing into a sorcerer (a preset)
describe('archetypes that change spellcasting', () => {
  let service: ApplyCharacterService;
  const sorcerer = (archetypes?: object[]) => addClassLevel(service, {
    class_name: 'Sorcerer', rolled_hp: 4, based_on: 'player description',
    features: '[{"name": "Eschew Materials", "gained_at": 1, "description": "Eschew Materials as a bonus feat", "adjustments": {"bonusFeats": 1}}]',
    ...(archetypes ? {archetypes: JSON.stringify(archetypes.map(a => ({replaces: ['Bloodline Arcana'], ...a})))} : {}),
  }) as any;
  const firstLevelSlots = () => service.applied().spells?.['sorcerer']?.spells?.[1]?.perDay?.total;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
  });

  it('casts with another ability, the rest of the class\'s spellcasting kept', () => {
    expect(sorcerer([{name: 'Sage', spellcasting: {ability: 'int'}}]).done).toContain('Sorcerer 1 (Sage)');
    const casting = service.raw().classLevels[1].spellcasting!;
    expect(casting.ability).toBe('int');
    expect(casting.type).toBe('spontaneous');
    expect(casting.table).toBe('sorcerer');
    expect(service.applied().spells['sorcerer'].ability).toBe('int');
  });

  it('casts one fewer spell a day at each spell level from 1st', () => {
    expect(sorcerer().done).toBeDefined();
    const slots = firstLevelSlots()!;
    const orisons = service.applied().spells['sorcerer'].spells[0]?.perDay?.total;
    service.undo();
    expect(sorcerer([{name: 'Fewer', spellcasting: {spells_per_day_change: -1}}]).done).toBeDefined();
    expect(firstLevelSlots()).toBe(slots - 1);
    expect(service.applied().spells['sorcerer'].spells[0]?.perDay?.total).toBe(orisons);
    // a later level of the class casts the same way
    expect(addClassLevel(service, {class_name: 'Sorcerer', rolled_hp: 4, features: '[]'}).done).toBeDefined();
    expect(service.raw().classLevels[2].spellcasting?.perDayChange).toBe(-1);
  });

  it('takes the class\'s spellcasting away', () => {
    expect(sorcerer([{name: 'Mundane', spellcasting: 'none'}]).done).toBeDefined();
    expect(service.raw().classLevels[1].spellcasting).toBeUndefined();
    expect(service.applied().spells?.['sorcerer']).toBeUndefined();
  });

  it('is refused with what is wrong with the change', () => {
    const result = sorcerer([{name: 'Odd', spellcasting: {type: 'sometimes'}}]);
    expect(result.problems.join(' ')).toContain('Odd: spellcasting.type is "prepared"');
    expect(service.raw().classLevels.length).toBe(1);
  });

  it('is kept when the class\'s spellcasting is given again', () => {
    expect(sorcerer([{name: 'Sage', spellcasting: {ability: 'int'}}]).done).toBeDefined();
    const result = setClassSpellcasting(service, {class_name: 'Sorcerer', spellcasting: '{"ability": "cha", "type": "spontaneous", "magic": "arcane", "table": "sorcerer"}'}) as any;
    expect(result.notes.join(' ')).toContain('changed as Sage changes it');
    expect(service.raw().classLevels[1].spellcasting!.ability).toBe('int');
  });
});

// alternate racial traits (ARG): each in place of the standard traits it replaces
describe('alternate racial traits', () => {
  const facts = {
    'racial traits': 'Defensive Training, Hatred, Stability, Greed',
    'alternate racial traits': 'Ancient Enmity (replaces Hatred); Craftsman (replaces Greed); Stubborn (replaces Hardy and Defensive Training)',
  };

  it('is checked against the traits it is taken with and its page', () => {
    expect(racialTraitProblems(facts, [{name: 'Ancient Enmity', replaces: ['Hatred']}, {name: 'Stability'}])).toEqual([]);
    const problems = racialTraitProblems(facts, [
      {name: 'Hatred'}, {name: 'Ancient Enmity', replaces: ['Hatred']}, {name: 'Other Enmity', replaces: ['Hatred', 'Lucky']}, {name: 'Craftsman'},
    ]).join(' ');
    expect(problems).toContain('Ancient Enmity replaces Hatred, which is among the traits too');
    expect(problems).toContain('Ancient Enmity and Other Enmity both replace Hatred');
    expect(problems).toContain('Other Enmity replaces Lucky, which is not a standard racial trait');
    expect(problems).toContain('Craftsman is an alternate racial trait: give its "replaces"');
  });

  it('is set with the race, the trait it replaces left out', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
    const page = 'https://aonprd.com/RacesDisplay.aspx?ItemName=Dwarf';
    await lookUpRule({name: 'fake', startSession: () => ({}) as any, readPages: async () => ({pages: [], text:
      `FOUND ${page}\n- dwarves\nFACT: racial traits = ${facts['racial traits']}\nFACT: alternate racial traits = ${facts['alternate racial traits']}`})},
      {name: 'Dwarf', kind: 'race'});
    const dwarf = (traits: object[]) => setRace(service, {name: 'Dwarf', based_on: 'looked up', source_url: page, features: JSON.stringify([
      {name: 'Dwarf racial stats', adjustments: {'speed.land': {value: 20, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Dwarven', 'abilityScores.con': 2}},
      {name: 'Defensive Training', description: '+4 dodge AC vs. giants', adjustments: {'ac[vs. giants]': {value: 4, type: 'dodge'}}},
      {name: 'Stability', description: '+4 CMD vs. bull rush and trip', adjustments: {'cmd[vs. bull rush or trip]': 4}},
      {name: 'Greed', description: '+2 Appraise on nonmagical goods with precious metals or gems', adjustments: {'skills.appraise.value[precious metals or gems]': 2}},
      ...traits,
    ])}) as any;
    const enmity = {name: 'Ancient Enmity', description: '+1 melee attack vs. elves', adjustments: {'melee.*.toHitBonus[vs. elves]': 1}};
    expect(dwarf([enmity]).problems.join(' ')).toContain('Ancient Enmity is an alternate racial trait');
    const result = dwarf([{...enmity, replaces: 'Hatred'}]);
    expect(result.done).toContain('Ancient Enmity');
    expect(service.raw().race.features.find(f => f.name === 'Ancient Enmity')!.replaces).toEqual(['Hatred']);
    clearLookups();
  });
});
