import { consoleCommands, importCharacter, importExample, registerConsoleCommands } from './console-commands';
import { ls } from './localstorage.util';
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

  it('registers the commands as pf1', () => {
    const target: any = {};
    registerConsoleCommands(target);
    expect(target.pf1).toBe(consoleCommands);
  });
});
