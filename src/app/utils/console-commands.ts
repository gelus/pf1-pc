import {v4} from 'uuid';
import {ls} from './localstorage.util';

// developer commands available from the browser console as pf1.<command>
// pf1.importExample() saves example-character.json as a character and opens it, pf1.importExample('cleric') the
// example cleric (example-cleric.json)
// pf1.importCharacter(json) does the same for any character, as an object or a JSON string

export interface ConsoleCommands {
  importCharacter(character: object | string, open?: boolean): string;
  importExample(example?: ExampleName | boolean, open?: boolean): Promise<string>;
  help(): void;
}

// saves a character and adds it to the character list, replacing a saved character with the same id
// returns the path of its sheet, and opens it unless open is false
const usage = 'usage: pf1.importCharacter(character), where character is a character object or its JSON string. '
  + 'pf1.importExample() imports the example character';

export const importCharacter = (character: object | string, open = true): string => {
  let parsed: any = character;
  if (typeof character === 'string') {
    try {
      parsed = JSON.parse(character);
    } catch (e) {
      throw new Error(`pf1.importCharacter: that is not valid JSON (${(e as Error).message}). ${usage}`);
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`pf1.importCharacter: expected a character, got ${Array.isArray(parsed) ? 'an array' : String(parsed)}. ${usage}`);
  }
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

// the examples, by name: the barbarian of example-character.json and a 3rd level cleric
export type ExampleName = 'barbarian' | 'cleric';
const examples: {[name in ExampleName]: () => Promise<{default: object}>} = {
  barbarian: () => import('../example-character.json'),
  cleric: () => import('../example-cleric.json'),
};

// an example keeps its id, importing it again resets it. the barbarian is the example when none is named,
// and pf1.importExample(false) still saves it without opening it
export const importExample = async (example: ExampleName | boolean = 'barbarian', open = true): Promise<string> => {
  if (typeof example === 'boolean') [example, open] = ['barbarian', example];
  const load = examples[example];
  if (!load) throw new Error(`pf1.importExample: no example named ${example}, try ${Object.keys(examples).join(' or ')}`);
  const {default: character} = await load();
  return importCharacter(character, open);
};

export const consoleCommands: ConsoleCommands = {
  importCharacter,
  importExample,
  help: () => console.info([
    'pf1.importExample()        save example-character.json as a character and open it',
    "pf1.importExample('cleric') save the example cleric and open it",
    'pf1.importCharacter(json)  save a character (an object or a JSON string) and open it',
    'pass false as the last argument to save without opening it',
  ].join('\n')),
};

export const registerConsoleCommands = (target: any = window): void => {
  target.pf1 = consoleCommands;
};
