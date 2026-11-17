import {v4} from 'uuid';
import {ls} from './localstorage.util';
import {AdjustmentProblem, formatProblems, hasErrors, validateAdjustments, validateCharacter, validateFeature} from '../rules/adjustment-schema';
import {adjustmentReference} from '../rules/adjustment-reference';

// developer commands available from the browser console as pf1.<command>
// pf1.importExample() saves example-character.json as a character and opens it, pf1.importExample('cleric') the
// example cleric (example-cleric.json)
// pf1.importCharacter(json) does the same for any character, as an object or a JSON string. it checks the features
// of the character first and does not import one the engine would get wrong, pf1.importCharacter(json, true, true)
// imports it anyway
// pf1.validate(json) checks a character, a feature or adjustments, pf1.reference() prints what features can adjust

export interface ConsoleCommands {
  importCharacter(character: object | string, open?: boolean, force?: boolean): string;
  importExample(example?: ExampleName | boolean, open?: boolean): Promise<string>;
  validate(json: object | string): AdjustmentProblem[];
  reference(): string;
  help(): void;
}

// saves a character and adds it to the character list, replacing a saved character with the same id
// returns the path of its sheet, and opens it unless open is false
const usage = 'usage: pf1.importCharacter(character), where character is a character object or its JSON string. '
  + 'pf1.importExample() imports the example character';

const parseJson = (json: object | string, command: string): any => {
  if (typeof json !== 'string') return json;
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`pf1.${command}: that is not valid JSON (${(e as Error).message}). ${usage}`);
  }
};

export const importCharacter = (character: object | string, open = true, force = false): string => {
  const parsed: any = parseJson(character, 'importCharacter');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`pf1.importCharacter: expected a character, got ${Array.isArray(parsed) ? 'an array' : String(parsed)}. ${usage}`);
  }
  const problems = validateCharacter(parsed);
  if (hasErrors(problems) && !force) {
    throw new Error(`pf1.importCharacter: the engine would skip or get wrong some features of this character, fix them `
      + `or import it anyway with pf1.importCharacter(json, true, true):\n${formatProblems(problems)}`);
  }
  if (problems.length) console.warn(`pf1.importCharacter: ${formatProblems(problems)}`);
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

// checks a character (it has classLevels or abilityScores), a feature (it has adjustments) or adjustments, and logs
// what is wrong. returns the problems, none when the engine can use all of it
export const validate = (json: object | string): AdjustmentProblem[] => {
  const parsed = parseJson(json, 'validate');
  const isObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  const problems = isObject && ('classLevels' in parsed || 'abilityScores' in parsed) ? validateCharacter(parsed)
    : isObject && 'adjustments' in parsed ? validateFeature(parsed)
    : validateAdjustments(parsed);
  if (problems.length) console.warn(formatProblems(problems));
  else console.info('pf1.validate: no problems');
  return problems;
};

export const reference = (): string => {
  const text = adjustmentReference();
  console.info(text);
  return text;
};

export const consoleCommands: ConsoleCommands = {
  importCharacter,
  importExample,
  validate,
  reference,
  help: () => console.info([
    'pf1.importExample()        save example-character.json as a character and open it',
    "pf1.importExample('cleric') save the example cleric and open it",
    'pf1.importCharacter(json)  save a character (an object or a JSON string) and open it',
    'pass false as the last argument to save without opening it',
    'pf1.validate(json)         check a character, a feature or adjustments, says what the engine would get wrong',
    'pf1.reference()            what features can adjust and how, with examples',
  ].join('\n')),
};

export const registerConsoleCommands = (target: any = window): void => {
  target.pf1 = consoleCommands;
};
