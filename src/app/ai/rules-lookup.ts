import {AiProvider} from './ai-provider';

// looks up a rule (a feat, a spell, an item, ...) on Archives of Nethys or d20pfsrd, by reading the page: the AI then
// builds the feature or item from the rules text, not from what it remembers
// the pages are read by the provider's own request (Gemini's URL context), which can not search: it reads the page a
// link names. the player can give the link, else the pages Archives of Nethys keeps the kind of rule at are tried by
// name (most rules are there under their exact name). searching the web (Grounding with Google Search) would find
// any page, but it is not on the free tier of the Gemini API

export const RULE_SITES = ['aonprd.com', 'd20pfsrd.com'];

export type RuleKind = 'feat' | 'spell' | 'trait' | 'magic item' | 'weapon' | 'armor' | 'gear';
export const ruleKinds: RuleKind[] = ['feat', 'spell', 'trait', 'magic item', 'weapon', 'armor', 'gear'];

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
};

// the names a rule may be filed under: "Cloak of Resistance +1" is "Cloak of Resistance", with a table of bonuses
export const nameVariants = (name: string): string[] => {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const plain = trimmed.replace(/\s*\+\d+$/, '').replace(/\s*\((?:combat|metamagic|teamwork|style|critical)\)$/i, '');
  return [...new Set([trimmed, plain])].filter(Boolean);
};

// the Archives of Nethys pages to try for a name: the kind's pages, or every kind's when it is not known
export const aonUrls = (name: string, kind?: RuleKind): string[] => {
  const pages = kind ? AON_PAGES[kind] : ruleKinds.flatMap(k => AON_PAGES[k]);
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

// the pages a lookup found, while the page is open: what the AI builds is "looked up" only from one of them
const foundPages = new Set<string>();
export const rememberLookup = (url: string): void => { foundPages.add(url); };
export const wasLookedUp = (url: string): boolean => foundPages.has(url);

export interface LookupResult {
  found?: boolean;
  url?: string;
  text?: string;
  error?: string;
  tried?: string[];
  hint?: string;
}

const instructions = (name: string): string => [
  name ? `Find the Pathfinder 1st edition rules for "${name}" on the pages below (Archives of Nethys or d20pfsrd). Most of`
    : 'Read the Pathfinder 1st edition rules on the page below (Archives of Nethys or d20pfsrd).',
  name ? 'them will not have it. If one has it, answer with FOUND and that page\'s URL on the first line, then its rules'
    : 'If it shows a rule, answer with FOUND and the page\'s URL on the first line, then its rules',
  'text word for word: the stat block or prerequisites, benefit, every number and table, as the page has it. If',
  name ? 'none has it, answer NOT FOUND and nothing else.' : 'it shows none, answer NOT FOUND and nothing else.',
].join(' ');

const notFoundHint = 'Ask the player for a link to the page on aonprd.com or d20pfsrd.com, then look it up with the url. '
  + 'Do not build it from memory without saying so.';

export const lookUpRule = async (
  provider: AiProvider | null | undefined, args: {name?: unknown, kind?: unknown, url?: unknown},
): Promise<LookupResult> => {
  if (!provider?.readPages) return {error: 'this AI can not read web pages'};
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const url = typeof args.url === 'string' ? args.url.trim() : '';
  const kind = ruleKinds.includes(args.kind as RuleKind) ? args.kind as RuleKind : undefined;
  if (!name && !url) return {error: 'give the name of the rule, or a link to its page'};
  if (url && !isRuleSite(url)) return {error: `only pages of ${RULE_SITES.join(' and ')} are looked up, not ${url}`};
  const urls = url ? [url] : aonUrls(name, kind);
  if (!urls.length) return {found: false, tried: [], hint: `a ${kind} can not be found by name. ${notFoundHint}`};
  const read = await provider.readPages({instructions: instructions(name), urls});
  const text = read.text.trim();
  const found = /^\**\s*FOUND\b/i.test(text) && !/^\**\s*NOT FOUND/i.test(text);
  if (!found) {
    const unread = read.pages.filter(p => !p.read).map(p => p.url);
    return {found: false, tried: urls, hint: notFoundHint, ...(unread.length === urls.length ? {error: 'none of the pages could be read'} : {})};
  }
  const [first, ...rest] = text.split('\n');
  const written = /(https?:\/\/\S+)/.exec(first)?.[1]?.replace(/[)*>\].,]+$/, '');
  // the page is the one the model names when it is one of the rules sites, never another link it wrote
  const pageUrl = written && isRuleSite(written) ? written : (urls.length === 1 ? urls[0] : undefined);
  if (pageUrl) rememberLookup(pageUrl);
  return {found: true, url: pageUrl, text: rest.join('\n').trim()};
};
