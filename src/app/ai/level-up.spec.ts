import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import example from '../example-character.json';
import { addClassLevel, chooseAbilityIncrease, levelUpStatus, setSkillRanks } from './level-up';

// leveling the example barbarian (level 1) up with the AI's tools
describe('level up', () => {
  let service: ApplyCharacterService;
  const status = () => levelUpStatus(service) as any;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
  });

  it('says what the next level needs', () => {
    expect(status().level).toBe(1);
    expect(status().classes).toEqual([{name: 'Barbarian', levels: 1}]);
    expect(status().coreClasses).toContain('Fighter');
    expect(status().nextLevelGets).toEqual(['a class level (its hit die, skill ranks, bab and saves come with it)']);
    expect(status().skillRanks.maxPerSkill).toBe(1);
  });

  it('adds the next barbarian level with the rolled hit die and its class features, as one step', () => {
    const before = service.applied();
    expect(addClassLevel(service, {class_name: 'barbarian', features: '[]'}).error).toContain('rolled_hp is the d12');
    const result = addClassLevel(service, {
      class_name: 'barbarian', rolled_hp: 7, based_on: 'player description',
      features: '[{"name": "Uncanny Dodge", "description": "Can not be caught flat-footed", "adjustments": {"defensiveAbilities": {"name": "Uncanny Dodge"}}}]',
    }) as any;
    expect(result.done).toBe('level 2: Barbarian 2 with Uncanny Dodge');
    const after = service.applied();
    expect(after.hp).toBe(before.hp + 7 + Math.floor((after.abilityScores.con - 10) / 2));
    expect(after.bab).toBe(Number(before.bab) + 1);
    expect(service.raw().classLevels[1]).toEqual(jasmine.objectContaining({name: 'Barbarian', level: 2, rolledHp: 7, hitDice: 12}));
    expect(result.stillToDo.join(' ')).toContain('skill ranks to spend');
    expect(service.history.undoLabel()).toBe('level 2: Barbarian 2');
    service.undo();
    expect(service.raw().classLevels.length).toBe(1);
  });

  it('multiclasses into a core class from its preset, and into another class described by its page', () => {
    // a class's first level gives class features: none written means they were left out
    expect((addClassLevel(service, {class_name: 'Fighter', rolled_hp: 6, features: '[]'}) as any).problems.join(' ')).toContain('gives class features');
    expect(addClassLevel(service, {
      class_name: 'Fighter', rolled_hp: 6, based_on: 'own knowledge',
      features: '[{"name": "Bonus Feat", "description": "a combat feat", "adjustments": {"bonusFeats": 1}}]',
    }).done).toBe('level 2: Fighter 1 with Bonus Feat (from memory, check it)');
    expect(service.raw().classLevels[1]).toEqual(jasmine.objectContaining({hitDice: 10, babProgression: 'full', startingWealth: 0}));
    expect(addClassLevel(service, {class_name: 'Slayer', rolled_hp: 5, features: '[]'}).error).toContain('not a core class');
    expect(addClassLevel(service, {
      class_name: 'Slayer', rolled_hp: 5, features: 'none', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6,
      class_skills: 'climb,stealth',
    }).done).toBe('level 3: Slayer 1');
    expect(service.raw().classLevels[2]).toEqual(jasmine.objectContaining({goodSaves: ['fort', 'ref'], classSkills: ['climb', 'stealth']}));
  });

  it('refuses class features the engine would get wrong, and adds nothing', () => {
    const result = addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 7, based_on: 'own knowledge', features: '[{"name": "Bad", "adjustments": {"acc": 1}}]'}) as any;
    expect(result.error).toContain('nothing was changed');
    expect(result.problems.join(' ')).toContain('acc');
    expect(service.raw().classLevels.length).toBe(1);
  });

  it('needs to know where class features come from, and marks those from memory', () => {
    const features = '[{"name": "Rage Power", "adjustments": {}, "descriptionOnly": "chosen next"}]';
    expect((addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 7, features}) as any).problems.join(' ')).toContain('based_on is one of');
    expect(addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 7, features, based_on: 'own knowledge'}).done)
      .toBe('level 2: Barbarian 2 with Rage Power (from memory, check it)');
  });

  it('owes an ability increase every 4th level until one is chosen', () => {
    addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 6, features: '[]'});
    // an increase at a level that gets none is left out, the level is still added
    expect((addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 6, ability_increase: 'str', features: '[]'}) as any).notes)
      .toEqual(['level 3 gives no ability increase (every 4th level does), ability_increase was left out']);
    addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 6, features: '[]'});
    expect(status().abilityIncreasesOwed).toEqual([4]);
    const str = service.applied().abilityScores.str;
    expect(chooseAbilityIncrease(service, {ability: 'str'}).done).toBe('+1 str for level 4');
    expect(service.applied().abilityScores.str).toBe(str + 1);
    expect(status().abilityIncreasesOwed).toEqual([]);
    expect(chooseAbilityIncrease(service, {ability: 'dex'}).error).toBe('no ability increase is owed');
  });

  it('sets skill ranks within the ranks the character has and one per level', () => {
    // the example barbarian spent its 2 ranks, its second level gives 2 more (4 - 2 for Int 7)
    addClassLevel(service, {class_name: 'Barbarian', rolled_hp: 6, features: '[]'});
    const left = status().skillRanks.left;
    expect(left).toBe(2);
    expect(setSkillRanks(service, {ranks: '{"climb": 3}'}).error).toBe('climb can have 2 ranks at most, one per character level');
    expect(setSkillRanks(service, {ranks: '{"knowledge": 1}'}).error).toContain('name the specialty');
    expect(setSkillRanks(service, {ranks: '{"swimming": 1}'}).error).toBe('there is no skill "swimming"');
    const result = setSkillRanks(service, {ranks: '{"swim": 1, "knowledge (nature)": 1}'}) as any;
    expect(result.done).toBe('skill ranks: swim 1, knowledge (nature) 1');
    expect(service.raw().skills['knowledge'].subSkills!['nature'].ranks).toBe(1);
    expect(status().skillRanks.left).toBe(left - 2);
  });

  it('makes the class of a first level the favored one, and reports every problem at once', () => {
    service.initializeCharacter(new Character());
    const result = addClassLevel(service, {
      class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, favored_class_bonus: 'skill', starting_gold: 175,
      based_on: 'looked up', features: '[{"name": "Studied Target", "adjustments": {"damageRollBonus": 1}}, {"name": "Track"}]',
    }) as any;
    const problems = result.problems.join('\n');
    expect(problems).toContain('based_on "looked up" needs the source_url');
    expect(problems).toContain('melee.*.damageBonus');
    expect(problems).toContain('Track adjusts nothing');
    const added = addClassLevel(service, {
      class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6, favored_class_bonus: 'skill', starting_gold: 175,
      based_on: 'own knowledge', features: '[{"name": "Track", "adjustments": {"skills.survival.value[follow tracks]": 1, "specialQuality": {"name": "Track"}}}]',
    }) as any;
    expect(added.notes).toEqual(['Slayer is the favored class now']);
    expect(service.raw().favoredClasses).toEqual(['Slayer']);
    expect(service.raw().classLevels[0].favoredClassBonus).toBe('skill');
  });

  it('refuses to spend more ranks than there are', () => {
    const many = Object.fromEntries(['climb', 'swim', 'ride', 'survival', 'intimidate', 'perception', 'bluff', 'heal', 'fly']
      .map(skill => [skill, 1]));
    expect(setSkillRanks(service, {ranks: JSON.stringify(many)}).error).toContain('too many');
  });
});
