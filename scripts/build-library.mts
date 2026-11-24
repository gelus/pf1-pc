// writes public/library/index.json from the entries under public/library/<kind>/, the list the app searches without
// loading them. run by npm before a build, a test run and the dev server (npm run library), with node's own
// TypeScript (--experimental-strip-types), so it uses the app's library-index.ts as it is.
// it refuses an entry whose shape is wrong or whose book is not in books.json (the OGL notice lists every book used)

import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {
  LIBRARY_KINDS, LIBRARY_SCHEMA_VERSION, type LibraryEntryBase, type LibraryIndex, booksOf, entryShapeProblems, indexRow,
} from '../src/app/library/library-index.ts';

const root = join(import.meta.dirname, '..', 'public', 'library');

const filesUnder = (dir: string): string[] => {
  let found: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found = found.concat(filesUnder(path));
    else if (name.endsWith('.json')) found.push(path);
  }
  return found;
};

const books = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) as {[code: string]: unknown};
const problems: string[] = [];
const entries: LibraryEntryBase[] = [];
for (const kind of LIBRARY_KINDS) {
  for (const path of filesUnder(join(root, kind))) {
    const file = relative(root, path).split(sep).join('/');
    let entry: LibraryEntryBase;
    try {
      entry = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      problems.push(`${file}: not JSON (${(error as Error).message})`);
      continue;
    }
    problems.push(...entryShapeProblems(entry, file));
    for (const book of booksOf(entry)) if (!(book in books)) problems.push(`${file}: its book ${book} is not in books.json`);
    entries.push(entry);
  }
}
const ids = new Set<string>();
for (const entry of entries) {
  if (ids.has(entry.id)) problems.push(`${entry.id}: two entries have this id`);
  ids.add(entry.id);
}
if (problems.length) {
  console.error(`library: ${problems.length} problem${problems.length > 1 ? 's' : ''}\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
entries.sort((a, b) => a.id.localeCompare(b.id));
const index: LibraryIndex = {schemaVersion: LIBRARY_SCHEMA_VERSION, entries: entries.map(indexRow)};
writeFileSync(join(root, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
console.log(`library: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} indexed`);
