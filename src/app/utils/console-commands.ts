import {v4} from 'uuid';
import {ls} from './localstorage.util';

// developer commands available from the browser console as pf1.<command>
// pf1.importExample() saves example-character.json as a character and opens it
// pf1.importCharacter(json) does the same for any character, as an object or a JSON string

export interface ConsoleCommands {
  importCharacter(character: object | string, open?: boolean): string;
  importExample(open?: boolean): Promise<string>;
  help(): void;
}

// saves a character and adds it to the character list, replacing a saved character with the same id
// returns the path of its sheet, and opens it unless open is false
export const importCharacter = (character: object | string, open = true): string => {
  const parsed = typeof character === 'string' ? JSON.parse(character) : character;
  const char = JSON.parse(JSON.stringify(parsed));
  if (!char.id) char.id = v4();

  const ids: string[] = ls.getItem('characters') || [];
  if (!ids.includes(char.id)) ids.push(char.id);
  ls.setItem('characters', ids);
  ls.setItem('character-' + char.id, char);

  const path = '/' + char.id;
  console.info(`Imported "${char.name ?? char.id}", its sheet is at ${path}`);
  // a full load, so a sheet that is already open shows the imported character
  if (open) window.location.assign(path);
  return path;
};

// the example character keeps its id, importing it again resets it
export const importExample = async (open = true): Promise<string> => {
  const {default: example} = await import('../example-character.json');
  return importCharacter(example, open);
};

export const consoleCommands: ConsoleCommands = {
  importCharacter,
  importExample,
  help: () => console.info([
    'pf1.importExample()        save example-character.json as a character and open it',
    'pf1.importCharacter(json)  save a character (an object or a JSON string) and open it',
    'pass false as the last argument to save without opening it',
  ].join('\n')),
};

export const registerConsoleCommands = (target: any = window): void => {
  target.pf1 = consoleCommands;
};
