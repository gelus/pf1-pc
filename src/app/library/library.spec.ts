import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {entryProblems} from './library-check';
import {LibraryEntry, choiceProblems, withChoices} from './library-entry';
import {LibraryIndex, booksOf, derivedTags, entryShapeProblems, indexRow, libraryFile} from './library-index';
import {LibraryService, searchIndex} from './library.service';

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

  it('holds every entry to its checks', () => {
    expect(entries.length).toBeGreaterThan(0);
    const problems = entries.flatMap(entry => entryProblems(entry, service, entries));
    expect(problems).withContext(problems.join('\n')).toEqual([]);
  });

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
    expect(entryProblems(changed(e => { e.kind = 'archetype'; e.id = 'archetype/half-orc'; }), service).join(' ')).toContain('not written yet');
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
      .toEqual(['Forest Walker', 'Skilled']);
    expect(fetched).toEqual(['library/index.json', 'library/race/half-orc.json']);
  });
});
