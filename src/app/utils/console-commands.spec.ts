import { consoleCommands, importCharacter, importExample, reference, registerConsoleCommands, validate } from './console-commands';
import { ls } from './localstorage.util';
import exampleCleric from '../example-cleric.json';
import exampleCharacter from '../example-character.json';

describe('console commands', () => {
  let savedIds: string | null;

  beforeEach(() => {
    savedIds = localStorage.getItem('characters');
    localStorage.removeItem('characters');
  });

  afterEach(() => {
    ls.removeItem('character-import-test');
    ls.removeItem('character-' + exampleCharacter.id);
    if (savedIds === null) localStorage.removeItem('characters');
    else localStorage.setItem('characters', savedIds);
  });

  it('saves a character and adds it to the character list', () => {
    const path = importCharacter({id: 'import-test', name: 'Imported'}, false);
    expect(path).toBe('/import-test');
    expect(ls.getItem('characters')).toEqual(['import-test']);
    expect(ls.getItem('character-import-test')).toEqual({id: 'import-test', name: 'Imported'});
  });

  it('takes a JSON string', () => {
    importCharacter('{"id": "import-test", "name": "From JSON"}', false);
    expect(ls.getItem('character-import-test').name).toBe('From JSON');
  });

  it('replaces a character with the same id without listing it twice', () => {
    importCharacter({id: 'import-test', name: 'First'}, false);
    importCharacter({id: 'import-test', name: 'Second'}, false);
    expect(ls.getItem('characters')).toEqual(['import-test']);
    expect(ls.getItem('character-import-test').name).toBe('Second');
  });

  it('gives a character without an id a new one', () => {
    const path = importCharacter({name: 'No Id'}, false);
    const id = path.slice(1);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ls.getItem('character-' + id).name).toBe('No Id');
    ls.removeItem('character-' + id);
  });

  it('imports the example character', async () => {
    const path = await importExample(false);
    expect(path).toBe('/' + exampleCharacter.id);
    expect(ls.getItem('character-' + exampleCharacter.id)).toEqual(JSON.parse(JSON.stringify(exampleCharacter)));
  });

  it('imports the example cleric by name', async () => {
    const path = await importExample('cleric', false);
    expect(path).toBe('/' + exampleCleric.id);
    expect(ls.getItem('character-' + exampleCleric.id)).toEqual(JSON.parse(JSON.stringify(exampleCleric)));
    ls.removeItem('character-' + exampleCleric.id);
  });

  it('names the examples when asked for one that does not exist', async () => {
    await expectAsync(importExample('bard' as any, false)).toBeRejectedWithError(/no example named bard, try barbarian or cleric/);
  });

  it('explains how to use it when it is not given a character', () => {
    expect(() => (importCharacter as any)()).toThrowError(/expected a character, got undefined\. usage: pf1\.importCharacter/);
    expect(() => importCharacter('[]', false)).toThrowError(/expected a character, got an array/);
    expect(() => importCharacter(42 as any, false)).toThrowError(/expected a character, got 42/);
    expect(() => importCharacter('{not json', false)).toThrowError(/not valid JSON .*usage:/);
    expect(ls.getItem('characters')).toBeNull();
  });

  it('registers the commands as pf1', () => {
    const target: any = {};
    registerConsoleCommands(target);
    expect(target.pf1).toBe(consoleCommands);
  });

  it('does not import a character whose features the engine would get wrong, unless forced', () => {
    const broken = {id: 'import-test', name: 'Typo', feats: [{name: 'Weapon Focus', adjustments: {'abilityScore.str': 2}}]};
    spyOn(console, 'warn');
    expect(() => importCharacter(broken, false))
      .toThrowError(/feats\[0\]\.adjustments\.abilityScore\.str: the character has no field "abilityScore", did you mean "abilityScores"\?/);
    expect(ls.getItem('character-import-test')).toBeNull();

    importCharacter(broken, false, true);
    expect(ls.getItem('character-import-test').name).toBe('Typo');
    expect(console.warn).toHaveBeenCalled();
  });

  it('validates a character, a feature or adjustments', () => {
    spyOn(console, 'warn');
    spyOn(console, 'info');
    expect(validate({name: 'Iron Will', adjustments: {'saves.will': 2}})).toEqual([]);
    expect(console.info).toHaveBeenCalledWith('pf1.validate: no problems');
    expect(validate('{"saves.wil": 2}')[0].message).toContain('did you mean "will"?');
    expect(validate({abilityScores: {str: 10}, feats: [{name: 'X', adjustments: {hp: true}}]})[0].path)
      .toBe('feats[0].adjustments.hp');
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('prints the reference', () => {
    spyOn(console, 'info');
    const text = reference();
    expect(text).toContain('# Adjusting a character');
    expect(console.info).toHaveBeenCalledWith(text);
  });
});
