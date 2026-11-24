import {Injectable} from '@angular/core';
import {LibraryEntry} from './library-entry';
import {LibraryIndex, LibraryIndexRow, LibraryKind, libraryFile} from './library-index';

// a search of the library: words of the name (or an alias), a kind, tags it must all have ("AC", "Combat"), and facts
// it must hold ({"race": "Half-Orc"}, a fact's words in any case)
export interface LibrarySearch {
  text?: string;
  kind?: LibraryKind | LibraryKind[];
  tags?: string[];
  facts?: {[fact: string]: string};
  limit?: number;
}

// names compared as words: "Half Orc", "half-orc" and "HALF-ORC" are one name
export const nameKey = (name: string): string => name.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

const factText = (value: string | string[] | undefined): string => nameKey(Array.isArray(value) ? value.join(' ') : value ?? '');

// how well a row answers the words: its name or an alias exactly, then one starting with them, then one holding every
// word; 0 when it does not. a search without words takes every row the filters leave
const score = (row: LibraryIndexRow, words: string): number => {
  if (!words) return 1;
  const names = [row.name, ...(row.aliases || [])].map(nameKey);
  if (names.includes(words)) return 100;
  if (names.some(name => name.startsWith(words))) return 60;
  const each = words.split(' ');
  if (names.some(name => each.every(word => name.split(' ').includes(word) || name.includes(word)))) return 40;
  const rest = nameKey([...row.tags, ...Object.values(row.facts || {}).flat()].join(' '));
  return each.every(word => rest.includes(word)) ? 10 : 0;
};

// the rows of the index a search finds, the best first (then by name)
export const searchIndex = (index: LibraryIndex, search: LibrarySearch): LibraryIndexRow[] => {
  const kinds = search.kind === undefined ? undefined : Array.isArray(search.kind) ? search.kind : [search.kind];
  const tags = (search.tags || []).map(tag => tag.trim().toLowerCase()).filter(Boolean);
  const words = nameKey(search.text || '');
  return index.entries
    .filter(row => !kinds || kinds.includes(row.kind))
    .filter(row => tags.every(tag => row.tags.some(has => has.toLowerCase() === tag)))
    .filter(row => Object.entries(search.facts || {}).every(([fact, wanted]) =>
      factText(row.facts?.[fact]).includes(nameKey(wanted))))
    .map(row => ({row, score: score(row, words)}))
    .filter(found => found.score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .slice(0, search.limit ?? 20)
    .map(found => found.row);
};

// the library as the app reads it: its index once, each entry as it is asked for. both are static files served with
// the app (public/library), so reading them costs no AI call and no database read
@Injectable({providedIn: 'root'})
export class LibraryService {
  private index?: Promise<LibraryIndex>;
  private entries = new Map<string, Promise<LibraryEntry | undefined>>();

  // the browser's fetch, replaced in a spec
  fetcher: (url: string) => Promise<Response> = url => fetch(url);

  loadIndex(): Promise<LibraryIndex> {
    this.index ??= this.fetcher('library/index.json')
      .then(response => response.ok ? response.json() as Promise<LibraryIndex> : {schemaVersion: 0, entries: []})
      .catch(() => ({schemaVersion: 0, entries: []}));
    return this.index;
  }

  async search(search: LibrarySearch): Promise<LibraryIndexRow[]> {
    return searchIndex(await this.loadIndex(), search);
  }

  // the entry of a name or an alias, exactly (any case, "-" or " ")
  async find(name: string, kind?: LibraryKind): Promise<LibraryEntry | undefined> {
    const wanted = nameKey(name);
    const row = (await this.loadIndex()).entries.find(entry => (!kind || entry.kind === kind)
      && [entry.name, ...(entry.aliases || [])].some(named => nameKey(named) === wanted));
    return row ? this.get(row.id) : undefined;
  }

  get(id: string): Promise<LibraryEntry | undefined> {
    if (!this.entries.has(id)) {
      this.entries.set(id, this.fetcher(libraryFile(id))
        .then(response => response.ok ? response.json() as Promise<LibraryEntry> : undefined)
        .catch(() => undefined));
    }
    return this.entries.get(id)!;
  }
}
