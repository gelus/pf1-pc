import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {entryProblems} from './library-check';
import {LibraryEntry, choiceProblems, withChoices} from './library-entry';
import {LibraryIndex, booksOf, derivedTags, entryShapeProblems, indexRow, libraryFile} from './library-index';
import {LibraryService, searchIndex} from './library.service';
import {applyArchetypes, archetypeRuleProblems} from '../rules/archetypes';
import {Archetype, ClassLevel} from '../utils/classlevel.class';

// the library's every entry, read as the app reads them (the files served from public/library), held to the checks
describe('the library', () => {
  let service: ApplyCharacterService;
  let index: LibraryIndex;
  let entries: LibraryEntry[];

  beforeAll(async () => {
    index = await (await fetch('library/index.json')).json();
    entries = await Promise.all(index.entries.map(async row => (await fetch(libraryFile(row.id))).json()));
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  // an entry at a time, the browser given a moment between them: a class or archetype is built at all 20 levels, and
  // the whole library at once kept the browser from answering the test runner
  it('holds every entry to its checks', async () => {
    expect(entries.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const entry of entries) {
      problems.push(...entryProblems(entry, service, entries));
      await new Promise(resolve => setTimeout(resolve));
    }
    expect(problems).withContext(problems.join('\n')).toEqual([]);
  }, 600000);

  it('has an index made from its entries as they are now (npm run library writes it)', () => {
    expect(index.entries).toEqual(entries.map(indexRow).sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('cites only books the OGL notice lists', async () => {
    const books = await (await fetch('library/books.json')).json();
    expect(entries.filter(entry => booksOf(entry).some(book => !(book in books))).map(entry => entry.id)).toEqual([]);
  });
});

describe('library entries', () => {
  let service: ApplyCharacterService;
  let halfOrc: LibraryEntry;

  beforeAll(async () => {
    halfOrc = await (await fetch(libraryFile('race/half-orc'))).json();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  const changed = (change: (entry: any) => void): LibraryEntry => {
    const copy = JSON.parse(JSON.stringify(halfOrc));
    change(copy);
    return copy;
  };

  it('gives the adjustments of the option picked of a choice between sets of them', () => {
    const data = {adjustments: {'{choice:benefit}': {fortitude: {'saves.fort': 1}, 'mind-affecting': {'savingThrowBonus[mind-affecting]': 2}}, init: 1}};
    expect(withChoices(data, {benefit: 'Mind-Affecting'}).adjustments).toEqual({'savingThrowBonus[mind-affecting]': 2, init: 1} as any);
    expect(withChoices(data, {benefit: 'fortitude'}).adjustments).toEqual({'saves.fort': 1, init: 1} as any);
    // unpicked, it stays as it is: no path the engine uses
    expect(Object.keys(withChoices(data, {}).adjustments)).toContain('{choice:benefit}');
  });

  it('fills a skill of a family picked as the rules write it into a path as its path', () => {
    const filled = withChoices({adjustments: {'skills.{choice:skill}.classSkill': true}, name: 'Lore of {choice:skill}'}, {skill: 'Knowledge (Nature)'});
    expect(filled.adjustments).toEqual({'skills.knowledge.subSkills.nature.classSkill': true} as any);
    expect(filled.name).toBe('Lore of Knowledge (Nature)');
  });

  it('fills a choice into the paths that name it, and holds the pick to its kind', () => {
    const filled = withChoices(halfOrc.data, {ability: 'Con'}) as any;
    expect(filled.features[0].adjustments['abilityScores.con']).toBe(2);
    expect((halfOrc.data as any).features[0].adjustments['abilityScores.{choice:ability}']).toBe(2);
    expect(choiceProblems(halfOrc.choices, {})).toEqual(['ability: the ability score that gets the +2']);
    expect(choiceProblems(halfOrc.choices, {ability: 'luck'})[0]).toContain('luck is not one of str, dex');
    expect(choiceProblems(halfOrc.choices, {ability: 'wis'})).toEqual([]);
  });

  it('tags an entry by what its adjustments do, a variant as situational', () => {
    expect(derivedTags({feature: {adjustments: {'ac': 1, 'saves.will[vs. fear]': 2, 'skills.knowledge.subSkills.arcana.value': 1}}}))
      .toEqual(jasmine.arrayWithExactContents(['AC', 'Saves', 'Situational', 'Will', 'Skills', 'Knowledge (Arcana)']));
    expect(indexRow(halfOrc).tags).toContain('Senses');
  });

  it('refuses an entry out of shape: its id, its file, a choice no path names', () => {
    expect(entryShapeProblems(changed(e => { e.id = 'Half Orc'; }), 'race/half-orc.json').join(' ')).toContain('its id starts with its kind');
    expect(entryShapeProblems(halfOrc, 'race/orc.json').join(' ')).toContain('its id says race/half-orc.json');
    expect(entryShapeProblems(changed(e => { e.choices.push({id: 'weapon', kind: 'weapon', label: 'a weapon'}); })).join(' '))
      .toContain('its choice weapon is named nowhere in its data');
    expect(entryShapeProblems(changed(e => { e.schemaVersion = 0; })).join(' ')).toContain('the library is at');
  });

  it('refuses an entry the engine, its facts or its own text do not bear out', () => {
    expect(entryProblems(halfOrc, service)).toEqual([]);
    expect(entryProblems(changed(e => { e.examples[0].expect['senses.darkvision'] = 90; }), service).join(' '))
      .toContain('senses.darkvision is 60, the example expects 90');
    expect(entryProblems(changed(e => { e.data.features = e.data.features.filter((f: any) => f.name !== 'Orc Blood'); }), service).join(' '))
      .toContain('lists Orc Blood, which no feature is');
    expect(entryProblems(changed(e => { e.data.features[1].adjustments['senses.darkvision'] = 120; e.examples[0].expect['senses.darkvision'] = 120; }), service).join(' '))
      .toContain('senses.darkvision gives 120, which its rules text never says');
    expect(entryProblems(changed(e => { e.data.features[2].adjustments = {'skills.intimidat.value': 2}; }), service).join(' '))
      .toContain('intimidat');
    expect(entryProblems(changed(e => { e.examples[0].choices = {}; }), service).join(' ')).toContain('pick ability');
    expect(entryProblems(changed(e => { e.data.features[2].adjustments = {'skills.intimidate.value[vs. fear and despair]': 2}; }), service).join(' '))
      .toContain('a variant is the situation alone');
    expect(entryProblems(changed(e => { e.data.features[2].adjustments = {'savingThrowBonus[fear, despair]': 2}; }), service).join(' '))
      .toContain('one variant for each situation');
    expect(entryProblems(changed(e => { e.kind = 'item'; e.id = 'item/half-orc'; }), service).join(' ')).toContain('not written yet');
  });

  it('holds an archetype to its class: what it trades is a class feature, and none it replaces is left', async () => {
    const all: LibraryEntry[] = await Promise.all(((await (await fetch('library/index.json')).json()) as LibraryIndex).entries
      .map(async row => (await fetch(libraryFile(row.id))).json()));
    const rager = all.find(e => e.id === 'archetype/barbarian/invulnerable-rager')!;
    expect(entryProblems(rager, service, all)).toEqual([]);
    const wrong = JSON.parse(JSON.stringify(rager));
    wrong.data.archetype.replaces = ['Uncanny Dodge', 'Ferocious Charge'];
    expect(entryProblems(wrong, service, all).join(' ')).toContain('it trades Ferocious Charge, which Barbarian has no feature of');
    const kept = JSON.parse(JSON.stringify(rager));
    kept.data.archetype.replaces = ['trap sense'];
    expect(entryProblems(kept, service, all).join(' ')).toContain('its page says it replaces or alters uncanny dodge, improved uncanny dodge, damage reduction, trap sense, its data trades trap sense');
  });

  it('lets two archetypes take other steps of one feature, never the same step', () => {
    const fighter = new ClassLevel({name: 'Fighter', level: 1});
    const trade = (name: string, tradesAt: {[feature: string]: number[]}, replaces: string[] = []): Archetype => ({name, replaces, tradesAt});
    expect(archetypeRuleProblems([], fighter, [trade('A', {'Weapon Training': [5]}), trade('B', {'Weapon Training': [9, 13]})])).toEqual([]);
    expect(archetypeRuleProblems([], fighter, [trade('A', {'Weapon Training': [5, 9]}), trade('B', {'Weapon Training': [9]})]).join(' '))
      .toContain('B and A both replace or alter Weapon Training');
    expect(archetypeRuleProblems([], fighter, [trade('A', {}, ['Weapon Training']), trade('B', {'Weapon Training': [9]})]).join(' '))
      .toContain('B and A both replace or alter Weapon Training');
  });

  it('takes one Knowledge off a class that has them all, and leaves the others', () => {
    const wizard = new ClassLevel({name: 'Wizard', level: 1, classSkills: ['appraise', 'knowledge']});
    applyArchetypes(wizard, [], [{name: 'Warden', replaces: [], classSkills: {add: ['climb'], remove: ['appraise', 'knowledge (nobility)']}}]);
    expect(wizard.classSkills).toContain('knowledge (arcana)');
    expect(wizard.classSkills).toContain('climb');
    expect(wizard.classSkills).not.toContain('knowledge (nobility)');
    expect(wizard.classSkills).not.toContain('knowledge');
    expect(wizard.classSkills).not.toContain('appraise');
  });

  it('is searched by name in any spelling, by kind, by tags and by facts', () => {
    const index: LibraryIndex = {schemaVersion: 1, entries: [
      indexRow(halfOrc),
      {id: 'feat/power-attack', kind: 'feat', name: 'Power Attack', tags: ['Attack', 'Combat', 'Damage'], facts: {prerequisites: 'Str 13, base attack bonus +1'}, source: {book: 'core-rulebook'}},
      {id: 'trait/reactionary', kind: 'trait', name: 'Reactionary', tags: ['Combat', 'Initiative'], facts: {category: 'Combat'}, source: {book: 'core-rulebook'}},
    ]};
    const ids = (search: Parameters<typeof searchIndex>[1]) => searchIndex(index, search).map(row => row.id);
    expect(ids({text: 'half orc'})).toEqual(['race/half-orc']);
    expect(ids({text: 'HALFORC'})).toEqual(['race/half-orc']);
    expect(ids({text: 'power'})).toEqual(['feat/power-attack']);
    expect(ids({tags: ['combat']})).toEqual(['feat/power-attack', 'trait/reactionary']);
    expect(ids({tags: ['Combat'], kind: 'trait'})).toEqual(['trait/reactionary']);
    expect(ids({facts: {prerequisites: 'str 13'}})).toEqual(['feat/power-attack']);
    expect(ids({text: 'initiative'})).toEqual(['trait/reactionary']);
    expect(ids({text: 'nothing like it'})).toEqual([]);
  });

  it('reads the index once, and an entry by its name or an alias', async () => {
    const library = TestBed.inject(LibraryService);
    const fetched: string[] = [];
    library.fetcher = url => { fetched.push(url); return fetch(url); };
    expect((await library.find('half orc', 'race'))?.id).toBe('race/half-orc');
    expect((await library.find('Halforc'))?.id).toBe('race/half-orc');
    expect(await library.find('Half-Orc', 'feat')).toBeUndefined();
    expect((await library.search({text: 'half-orc'}))[0].id).toBe('race/half-orc');
    expect((await library.search({kind: 'racial-trait', facts: {race: 'half-orc', replaces: 'darkvision'}})).map(row => row.name))
      .toEqual(['Dragon Sight', 'Forest Walker', 'Low-Light Vision', 'Sea Raider', 'Skilled', 'Smog Sight', 'Vigilant Gaze', 'War-Leader']);
    expect(fetched).toEqual(['library/index.json', 'library/race/half-orc.json']);
  });
});
