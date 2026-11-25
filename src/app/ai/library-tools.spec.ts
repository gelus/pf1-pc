import {TestBed} from '@angular/core/testing';

import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {runAiTool} from './ai-tools';

// the AI's tools reading and taking the app's library (public/library, as the app serves it): a race, a class level
// and an archetype taken from their entries with the player's picks, no page read and nothing written by the AI
describe('the library in the AI\'s tools', () => {
  let service: ApplyCharacterService;
  const run = (name: string, args: object) => runAiTool(name, args as {[name: string]: unknown}, {character: service}) as Promise<any>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    const char = new Character();
    char.abilityScores = {str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8};
    service.initializeCharacter(JSON.parse(JSON.stringify(char)));
  });

  it('finds entries by name, kind and facts, and reads one with what goes with it', async () => {
    const found = await run('search_library', {kind: 'racial-trait', facts: JSON.stringify({race: 'Dwarf', replaces: 'Darkvision'})});
    expect(found.found.map((row: any) => row.name)).toContain('Minesight');
    const dwarf = await run('get_library_entry', {id: 'Dwarf', kind: 'race'});
    expect(dwarf.id).toBe('race/dwarf');
    expect(dwarf.text).toContain('Darkvision');
    expect(dwarf.alternateRacialTraits.map((t: any) => t.name)).toContain('Minesight');
    expect(dwarf.favoredClassOptions.length).toBeGreaterThan(30);
    expect((await run('get_library_entry', {id: 'class/barbarian'})).archetypes.map((a: any) => a.name)).toContain('Invulnerable Rager');
    expect((await run('search_library', {text: 'no such rule'})).note).toContain('look_up_rules');
  });

  it('answers look_up_rules from the library when it has the rule, with no page read', async () => {
    const rager = await run('look_up_rules', {name: 'Barbarian Invulnerable Rager', kind: 'archetype'});
    expect(rager.fromLibrary).toBeTrue();
    expect(rager.id).toBe('archetype/barbarian/invulnerable-rager');
    expect(rager.use).toContain('library_archetypes');
    // a rule it lacks goes to the page, which this AI can not read
    expect((await run('look_up_rules', {name: 'Fireball', kind: 'spell'})).error).toContain('can not read web pages');
  });

  it('takes a race with an alternate racial trait in place of what it replaces, and its favored class options', async () => {
    const result = await run('set_race', {library_id: 'race/dwarf', alternate_traits: 'Minesight'});
    expect(result.done).toContain('from the library');
    const race = service.raw().race;
    expect(race.libraryId).toBe('race/dwarf');
    expect(race.features.map(f => f.name)).toContain('Minesight');
    expect(race.features.map(f => f.name)).not.toContain('Darkvision');
    expect(race.features.find(f => f.name === 'Minesight')!.libraryId).toBe('racial-trait/dwarf/minesight');
    expect(service.applied().senses?.['darkvision']).toBe(90);
    expect((race.favoredClassOptions || []).length).toBeGreaterThan(30);
    // another dwarf's trait, or one of another race, is refused
    expect((await run('set_race', {library_id: 'race/dwarf', alternate_traits: 'Dual Talent'})).problems.join(' ')).toContain('no alternate racial trait of the Dwarf');
  });

  it('asks only for the picks still needed: a human\'s +2, unless a trait replaced it', async () => {
    expect((await run('set_race', {library_id: 'race/human'})).problems.join(' ')).toContain('ability: the ability score that gets the +2');
    const dual = await run('set_race', {library_id: 'race/human', alternate_traits: 'racial-trait/human/dual-talent'});
    expect(dual.problems.join(' ')).not.toContain('ability: the ability score');
    expect(dual.problems.join(' ')).toContain('talent-first');
    expect((await run('set_race', {library_id: 'race/human', choices: JSON.stringify({ability: 'str'})})).done).toContain('Human');
    expect(service.applied().abilityScores.str).toBe(18);
  });

  it('builds a class level from the library, with an archetype\'s trades made at later levels', async () => {
    await run('set_race', {library_id: 'race/half-orc', choices: JSON.stringify({ability: 'str'})});
    const first = await run('add_class_level', {library_id: 'class/barbarian', library_archetypes: 'archetype/barbarian/invulnerable-rager', favored_class_bonus: 'hp'});
    expect(first.done).withContext(JSON.stringify(first)).toContain('Barbarian 1 (Invulnerable Rager)');
    const level = service.raw().classLevels[0];
    expect(level.libraryId).toBe('class/barbarian');
    expect(level.features.map(f => f.name)).toEqual(jasmine.arrayContaining(['Fast Movement', 'Rage']));
    expect(level.archetypes?.[0].libraryId).toBe('archetype/barbarian/invulnerable-rager');
    expect(service.applied().bab).toBe(1);
    const second = await run('add_class_level', {library_id: 'barbarian', rolled_hp: 8, favored_class_bonus: 'hp'});
    expect(second.done).withContext(JSON.stringify(second)).toContain('Barbarian 2');
    const names = service.raw().classLevels[1].features.map(f => f.name);
    expect(names).toContain('Invulnerability');
    expect(names).not.toContain('Uncanny Dodge');
    // a feature the library gives, written again, is refused
    const again = await run('add_class_level', {library_id: 'class/barbarian', rolled_hp: 8, favored_class_bonus: 'hp',
      features: JSON.stringify([{name: 'Extreme Endurance', gained_at: 3, description: 'again', description_only: 'judged at the table'}])});
    expect(again.problems.join(' ')).toContain('gives it already at this level');
  });

  it('takes a race\'s favored class option by its description on a library class level', async () => {
    await run('set_race', {library_id: 'race/dwarf'});
    const option = service.raw().race.favoredClassOptions!.find(o => o.class === 'Barbarian')!;
    const result = await run('add_class_level', {library_id: 'class/barbarian', favored_class_bonus: 'other', favored_class_option: option.description});
    expect(result.done).withContext(JSON.stringify(result)).toContain('Barbarian 1');
    expect(service.raw().classLevels[0].favoredClassOption).toBe(option.id);
    // the same race taken again keeps the option's id, so the level still names it
    await run('set_race', {library_id: 'race/dwarf'});
    expect(service.raw().race.favoredClassOptions!.some(o => o.id === option.id)).toBeTrue();
  });
});
