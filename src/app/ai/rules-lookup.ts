import {AiProvider} from './ai-provider';

// looks up a rule (a feat, a spell, an item, ...) on Archives of Nethys or d20pfsrd, by reading the page: the AI then
// builds the feature or item from the rules text, not from what it remembers
// the pages are read by the provider's own request (Gemini's URL context), which can not search: it reads the page a
// link names. the player can give the link, else the pages Archives of Nethys keeps the kind of rule at are tried by
// name (most rules are there under their exact name). searching the web (Grounding with Google Search) would find
// any page, but it is not on the free tier of the Gemini API

export const RULE_SITES = ['aonprd.com', 'd20pfsrd.com'];

export type RuleKind = 'feat' | 'spell' | 'trait' | 'magic item' | 'weapon' | 'armor' | 'gear' | 'class' | 'race' | 'archetype';
export const ruleKinds: RuleKind[] = ['feat', 'spell', 'trait', 'magic item', 'weapon', 'armor', 'gear', 'class', 'race', 'archetype'];

// the pages of Archives of Nethys a kind of rule is on, and the parameter they take its name in
const AON_PAGES: {[kind in RuleKind]: string[]} = {
  'feat': ['FeatDisplay.aspx?ItemName='],
  'spell': ['SpellDisplay.aspx?ItemName='],
  'trait': ['TraitDisplay.aspx?ItemName='],
  // Archives of Nethys files magic items under names that can not be told from the item's name (its pages by name
  // show the list of them instead), so a magic item needs a link
  'magic item': [],
  'weapon': ['EquipmentWeaponsDisplay.aspx?ItemName='],
  'armor': ['EquipmentArmorDisplay.aspx?ItemName='],
  'gear': ['EquipmentMiscDisplay.aspx?ItemName='],
  // a class page has its table (bab, saves, the class features of every level) and the class features themselves
  'class': ['ClassDisplay.aspx?ItemName='],
  'race': ['RacesDisplay.aspx?ItemName='],
  // an archetype is named with its class first: "Barbarian Invulnerable Rager"
  'archetype': ['ArchetypeDisplay.aspx?FixedName='],
};

// the names a rule may be filed under: "Cloak of Resistance +1" is "Cloak of Resistance", with a table of bonuses
export const nameVariants = (name: string): string[] => {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const plain = trimmed.replace(/\s*\+\d+$/, '').replace(/\s*\((?:combat|metamagic|teamwork|style|critical)\)$/i, '');
  return [...new Set([trimmed, plain])].filter(Boolean);
};

// the Archives of Nethys pages to try for a name: the kind's pages, or every kind's when it is not known
export const aonUrls = (name: string, kind?: RuleKind): string[] => {
  // an archetype is named after its class, so it is only tried when asked for
  const pages = kind ? AON_PAGES[kind] : ruleKinds.filter(k => k !== 'archetype').flatMap(k => AON_PAGES[k]);
  const urls = nameVariants(name).flatMap(variant =>
    [...new Set(pages)].map(page => `https://aonprd.com/${page}${encodeURIComponent(variant)}`));
  // the provider reads 20 pages at most
  return urls.slice(0, 20);
};

export const isRuleSite = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return RULE_SITES.some(site => host === site || host.endsWith(`.${site}`));
  } catch {
    return false;
  }
};

// the pages a lookup found, while the page is open: what the AI builds is "looked up" only from one of them. the
// page found for a name stands for what is built under that name, when the AI leaves its url out
const foundPages = new Set<string>();
const pageForName = new Map<string, string>();
const nameKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export const rememberLookup = (url: string, name?: string): void => {
  foundPages.add(url);
  if (name) pageForName.set(nameKey(name), url);
};
export const wasLookedUp = (url: string): boolean => foundPages.has(url);
export const lookedUpUrlFor = (name: string): string | undefined => {
  const key = nameKey(name);
  // "Spell Focus (Evocation)" was looked up as "Spell Focus"
  return pageForName.get(key) ?? pageForName.get(nameKey(name.replace(/\s*\(.*\)\s*$/, '')));
};

export interface LookupResult {
  found?: boolean;
  url?: string;
  text?: string;
  error?: string;
  tried?: string[];
  hint?: string;
}

// the rules in the reader's own words, never the page's: an answer that copies a page word for word is cut off by
// the provider (Gemini stops it as a recitation, with no text), which looked like the rule was not there
const instructions = (name: string, focus: string): string => [
  name ? `Find the Pathfinder 1st edition rules for "${name}" on the pages below (Archives of Nethys or d20pfsrd). Most of`
    : 'Read the Pathfinder 1st edition rules on the page below (Archives of Nethys or d20pfsrd).',
  name ? 'them will not have it. If one has it, answer with FOUND and that page\'s URL on the first line, then its rules'
    : 'If it shows a rule, answer with FOUND and the page\'s URL on the first line, then its rules',
  focus ? `as short notes in your own words, only the parts about: ${focus}`
    : 'as short notes in your own words: prerequisites, what it does, its type or category',
  '(keep every number, bonus type, condition and table row they need; do not copy the page\'s sentences). If',
  name ? 'none has it, answer NOT FOUND and nothing else.' : 'it shows none, answer NOT FOUND and nothing else.',
].join(' ');

const notFoundHint = 'Ask the player for a link to the page on aonprd.com or d20pfsrd.com, then look it up with the url. '
  + 'Do not build it from memory without saying so.';

export const lookUpRule = async (
  provider: AiProvider | null | undefined, args: {name?: unknown, kind?: unknown, url?: unknown, focus?: unknown},
): Promise<LookupResult> => {
  if (!provider?.readPages) return {error: 'this AI can not read web pages'};
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const url = typeof args.url === 'string' ? args.url.trim() : '';
  const kind = ruleKinds.includes(args.kind as RuleKind) ? args.kind as RuleKind : undefined;
  if (!name && !url) return {error: 'give the name of the rule, or a link to its page'};
  if (url && !isRuleSite(url)) return {error: `only pages of ${RULE_SITES.join(' and ')} are looked up, not ${url}`};
  const urls = url ? [url] : aonUrls(name, kind);
  if (!urls.length) return {found: false, tried: [], hint: `a ${kind} can not be found by name. ${notFoundHint}`};
  const focus = typeof args.focus === 'string' ? args.focus.trim() : '';
  // a page read once in the page's lifetime is not read again: each read is a request against the AI's limits
  const cacheKey = JSON.stringify([name, focus, urls]).toLowerCase();
  const cached = lookups.get(cacheKey);
  if (cached) return cached;
  let result = await readRule(provider, name, focus, urls);
  // the provider gave no answer (it stopped it, or a page did not come through): one more read often has it
  if (!result.found && result.blank) result = await readRule(provider, name, focus, urls);
  // the same rule found before with another focus is better than nothing
  const before = !result.found ? foundByName.get(nameKey(name || url)) : undefined;
  if (before) return before;
  const {blank, ...answer} = result;
  if (answer.found) {
    lookups.set(cacheKey, answer);
    foundByName.set(nameKey(name || url), answer);
  }
  return answer;
};

const lookups = new Map<string, LookupResult>();
const foundByName = new Map<string, LookupResult>();
export const clearLookups = (): void => {
  lookups.clear();
  foundByName.clear();
};

const readRule = async (provider: AiProvider, name: string, focus: string, urls: string[]): Promise<LookupResult & {blank?: boolean}> => {
  const read = await provider.readPages!({instructions: instructions(name, focus), urls});
  const text = read.text.trim();
  const found = /^\**\s*FOUND\b/i.test(text) && !/^\**\s*NOT FOUND/i.test(text);
  if (!found) {
    const unread = read.pages.filter(p => !p.read).map(p => p.url);
    return {
      found: false, tried: urls, hint: notFoundHint, ...(text ? {} : {blank: true}),
      ...(unread.length === urls.length && read.pages.length ? {error: 'none of the pages could be read'} : {}),
    };
  }
  const [first, ...rest] = text.split('\n');
  const written = /(https?:\/\/\S+)/.exec(first)?.[1]?.replace(/[)*>\].,]+$/, '');
  // the page is the one the model names when it is one of the rules sites, never another link it wrote
  const pageUrl = written && isRuleSite(written) ? written : (urls.length === 1 ? urls[0] : undefined);
  if (pageUrl) rememberLookup(pageUrl, name);
  return {found: true, url: pageUrl, text: rest.join('\n').trim()};
};
