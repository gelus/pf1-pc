import {AiProvider} from './ai-provider';

// looks up a rule (a feat, a spell, an item, ...) on Archives of Nethys or d20pfsrd, by reading the page: the AI then
// builds the feature or item from the rules text, not from what it remembers
// the pages are read by the provider's own request (Gemini's URL context), which can not search: it reads the page a
// link names. the player can give the link, else the pages Archives of Nethys keeps the kind of rule at are tried by
// name (most rules are there under their exact name). searching the web (Grounding with Google Search) would find
// any page, but it is not on the free tier of the Gemini API

export const RULE_SITES = ['aonprd.com', 'd20pfsrd.com'];

// the kinds of rule a name is tried at: those of a page of their own, and the class options (a mystery, a bloodline, a
// domain, a school) a class's 1st-level choice is. a rule that has no page of its own (a curse, a hex, a rage power, a
// talent, a discovery) is on its list's page, one for all of them; a revelation, a subdomain, an alternate racial
// trait on the page of what it belongs to (within: "Flame", "Fire", "Gnome")
export const ruleKinds = [
  'feat', 'spell', 'trait', 'magic item', 'weapon', 'armor', 'gear', 'class', 'race', 'archetype',
  'mystery', 'curse', 'revelation', 'bloodline', 'domain', 'arcane school', 'hex', 'rage power', 'rogue talent',
  'alchemist discovery', 'arcane discovery',
] as const;
export type RuleKind = typeof ruleKinds[number];

// a rule on the page of another, named by "within": its kind's parent kind (a revelation is on its mystery's page)
const WITHIN: {[kind in RuleKind]?: RuleKind} = {revelation: 'mystery'};

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
  // class options with a page of their own (Archives of Nethys, checked 2026-11-21)
  'mystery': ['MysteryDisplay.aspx?ItemName='],
  'bloodline': ['BloodlineDisplay.aspx?ItemName='],
  'domain': ['DomainDisplay.aspx?ItemName='],
  'arcane school': ['SchoolDisplay.aspx?ItemName='],
  // and those listed all together on one page: the page is the same whatever the name (LIST_PAGES)
  'curse': [], 'revelation': [], 'hex': [], 'rage power': [], 'rogue talent': [], 'alchemist discovery': [], 'arcane discovery': [],
};

// the one page every rule of a kind is listed on, with no page of its own
const LIST_PAGES: {[kind in RuleKind]?: string} = {
  'curse': 'OracleCurses.aspx', 'hex': 'WitchHexes.aspx', 'rage power': 'BarbarianRagePowers.aspx',
  'rogue talent': 'RogueTalents.aspx', 'alchemist discovery': 'AlchemistDiscoveries.aspx',
  'arcane discovery': 'WizardArcaneDiscoveries.aspx',
};

// the names a rule may be filed under: "Cloak of Resistance +1" is "Cloak of Resistance", with a table of bonuses
export const nameVariants = (name: string): string[] => {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const plain = trimmed.replace(/\s*\+\d+$/, '').replace(/\s*\((?:combat|metamagic|teamwork|style|critical)\)$/i, '');
  return [...new Set([trimmed, plain])].filter(Boolean);
};

// the Archives of Nethys pages to try for a name: the kind's pages, or every kind's when it is not known
export const aonUrls = (name: string, kind?: RuleKind, within?: string): string[] => {
  // a rule on its parent's page (a revelation on its mystery's), or on its kind's list
  const parent = kind ? WITHIN[kind] : undefined;
  if (parent && within?.trim()) return aonUrls(within, parent);
  const list = kind ? LIST_PAGES[kind] : undefined;
  if (list) return [`https://aonprd.com/${list}`];
  // an archetype is named after its class, and the class options are only tried when asked for
  const pages = kind ? AON_PAGES[kind]
    : (['feat', 'spell', 'trait', 'magic item', 'weapon', 'armor', 'gear', 'class', 'race'] as RuleKind[]).flatMap(k => AON_PAGES[k]);
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

// the rules a lookup read off a page, by the page: what the AI builds from it is checked against them too, not only
// against the description it wrote (a feature's Knowledge bonus dropped from both went unseen)
const pageText = new Map<string, string>();
const pageFacts = new Map<string, {[fact: string]: string}>();
// the facts a class page was read to give (CLASS_FACTS), by the page or the name it was looked up by
export const pageFactsFor = (url: string | undefined, name?: string): {[fact: string]: string} | undefined =>
  (url ? pageFacts.get(url) : undefined) ?? (name ? pageFacts.get(lookedUpUrlFor(name) ?? '') : undefined);
export const lookedUpText = (url: string | undefined): string | undefined => (url ? pageText.get(url) : undefined);
// the lines of the page's notes about one rule ("**Studied Target:** ..."), or all of it for a page of one rule
export const rulesTextFor = (url: string | undefined, name: string, whole = false): string | undefined => {
  const text = lookedUpText(url);
  if (!text || !name.trim()) return whole ? text : undefined;
  if (whole) return text;
  // the line that defines it: its name as the label the line starts with ("**Studied Target:** ...", "Track (Ex): ..."),
  // never a line that only names it (the class table's row lists every feature of the level, with another's "1/day")
  const plain = (value: string) => value.toLowerCase().replace(/[’‘`]/g, "'").replace(/[*_]/g, '').trim();
  const wanted = plain(name).replace(/\s*\(.*\)\s*$/, '');
  const lines = text.split('\n').filter(line => {
    const label = plain(line).replace(/^[-•\s]+/, '');
    return label.startsWith(wanted) && /^\s*(\([^)]*\)\s*)?[:.\-–—]/.test(label.slice(wanted.length));
  });
  return lines.length ? lines.join(' ') : undefined;
};
export const lookedUpUrlFor = (name: string): string | undefined => {
  const key = nameKey(name);
  // "Spell Focus (Evocation)" was looked up as "Spell Focus"
  return pageForName.get(key) ?? pageForName.get(nameKey(name.replace(/\s*\(.*\)\s*$/, '')));
};

export interface LookupResult {
  found?: boolean;
  url?: string;
  text?: string;
  // the links of the page to the rules it leads to (a class's mysteries, a mystery's index), to read next by url
  links?: {name: string, url: string}[];
  error?: string;
  tried?: string[];
  hint?: string;
}

// the rules in the reader's own words, never the page's: an answer that copies a page word for word is cut off by
// the provider (Gemini stops it as a recitation, with no text), which looked like the rule was not there
// the facts of a class page, read apart from the notes in a fixed form the app checks the AI's class level against
// (an oracle went in with martial weapons and 75 gp of the page's 105): what the AI wrote is held against a reading
// of its own, not against the AI's memory
export const CLASS_FACTS = ['hit die', 'skill ranks', 'starting wealth', 'class skills', 'weapon proficiencies', 'armor proficiencies', 'alignment', 'requirements'];
// a race page's standard racial traits (a gnome's Weapon Familiarity went missing), a feat page's prerequisites (an
// Extra Revelation the AI said needed 7th level)
// and its alternate racial traits with the standard ones each replaces, which the AI's alternate trait is held to
export const RACE_FACTS = ['racial traits', 'alternate racial traits'];
export const FEAT_FACTS = ['prerequisites'];
// a trait page's category (a drawback typed as a trait counted as a third trait) and its prerequisites (a race trait)
export const TRAIT_FACTS = ['category', 'prerequisites'];
// an archetype page's class features of the base class it replaces or alters ("This ability replaces uncanny dodge"),
// held against what the AI says it trades, so a later level does not give the class feature it traded away
export const ARCHETYPE_FACTS = ['replaced features'];
type PageKind = 'class' | 'race' | 'feat' | 'trait' | 'archetype';
const FACTS_ASKED: {[kind in PageKind]: string} = {
  class: ['Then, for a class page, lines of their own for each of these, as the page gives them:',
    `${CLASS_FACTS.map(fact => `"FACT: ${fact} = ..."`).join(', ')}`,
    '(hit die as "d8", skill ranks as the number before "+ Int modifier", starting wealth as its dice ("3d6 x 10 gp"),',
    'class skills and proficiencies as comma-separated lists, requirements as a prestige class lists them to enter it',
    '("Alignment: any evil. Skills: Stealth 5 ranks. Feats: Dodge. Spells: able to cast 2nd-level arcane spells"), "none" for none).'].join(' '),
  race: 'Then, for a race page, a line of its own: "FACT: racial traits = ..." with the names of its standard racial '
    + 'traits (not its alternate ones), comma separated, as the page heads them, and a line "FACT: alternate racial '
    + 'traits = ..." with each alternate racial trait the page gives and the standard traits it replaces, as '
    + '"Name (replaces Trait, Trait); Name (replaces Trait)", "none" for none.',
  feat: 'Then, for a feat page, a line of its own: "FACT: prerequisites = ..." exactly as the page lists them, "none" for none.',
  trait: 'Then, for a trait or drawback page, lines of their own: "FACT: category = ..." as the page gives it (Combat, '
    + 'Faith, Magic, Social, Race, Regional, Religion, Drawback, ...) and "FACT: prerequisites = ..." as the page lists '
    + 'them (a race trait\'s race), "none" for none.',
  // only what the page says in so many words: on a page naming none (a totem warrior's), the reader filled the line
  // from what the archetype is about (fast movement one time, rage powers the next) and the AI was held to it
  archetype: 'Then, for an archetype page, a line of its own: "FACT: replaced features = ..." with every class feature '
    + 'of the base class the page itself says the archetype replaces or alters (its words "replaces", "alters", '
    + '"in place of", "instead of"), comma separated, named as the base class names them. Never a feature it only '
    + 'mentions or works with, never from memory: "none" when the page says it replaces nothing or names none.',
};
// the kind asked for, else the page's by its address: an archetype's first, d20pfsrd keeps archetypes under their
// class's page (/classes/.../archetypes/)
const PAGE_KINDS: [PageKind, RegExp][] = [
  ['archetype', /ArchetypeDisplay\.aspx|\/archetypes\//i], ['class', /ClassDisplay\.aspx|\/classes\//i],
  ['race', /RacesDisplay\.aspx|\/races\//i], ['feat', /FeatDisplay\.aspx|\/feats\//i], ['trait', /TraitDisplay\.aspx|\/traits\//i],
];
const pageKindOf = (kind: string | undefined, urls: string[]): PageKind | undefined =>
  PAGE_KINDS.find(([k]) => k === kind)?.[0] ?? PAGE_KINDS.find(([, page]) => urls.some(url => page.test(url)))?.[0];

const instructions = (name: string, focus: string, pageKind?: PageKind): string => [
  name ? `Find the Pathfinder 1st edition rules for "${name}" on the pages below (Archives of Nethys or d20pfsrd). Most of`
    : 'Read the Pathfinder 1st edition rules on the page below (Archives of Nethys or d20pfsrd).',
  name ? 'them will not have it. If one has it, answer with FOUND and that page\'s URL on the first line, then its rules'
    : 'If it shows a rule, answer with FOUND and the page\'s URL on the first line, then its rules',
  focus ? `as short notes in your own words, only the parts about: ${focus}`
    : 'as short notes in your own words: prerequisites, what it does, its type or category',
  '(keep every number, bonus type, condition and table row they need; do not copy the page\'s sentences). Then, on',
  'lines of their own starting "LINK:", up to 15 links of the page to other rules pages of the same site that the',
  'notes point to or that hold the parts asked about (a class\'s list of mysteries, bloodlines, domains, schools,',
  'curses, hexes or talents; a list\'s entries): "LINK: <its name> | <its full URL>". If',
  ...(pageKind ? [FACTS_ASKED[pageKind], 'If'] : []),
  name ? 'none has it, answer NOT FOUND and nothing else.' : 'it shows none, answer NOT FOUND and nothing else.',
].join(' ');

const notFoundHint = 'Ask the player for a link to the page on aonprd.com or d20pfsrd.com, then look it up with the url. '
  + 'Do not build it from memory without saying so. Not found by its exact name, it may not be a Pathfinder 1st edition '
  + 'rule at all: never offer it to the player as one.';

export const lookUpRule = async (
  provider: AiProvider | null | undefined, args: {name?: unknown, kind?: unknown, url?: unknown, focus?: unknown, within?: unknown},
): Promise<LookupResult> => {
  if (!provider?.readPages) return {error: 'this AI can not read web pages'};
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const url = typeof args.url === 'string' ? args.url.trim() : '';
  const kind = ruleKinds.includes(args.kind as RuleKind) ? args.kind as RuleKind : undefined;
  if (!name && !url) return {error: 'give the name of the rule, or a link to its page'};
  if (url && !isRuleSite(url)) return {error: `only pages of ${RULE_SITES.join(' and ')} are looked up, not ${url}`};
  const within = typeof args.within === 'string' ? args.within.trim() : '';
  if (kind && WITHIN[kind] && !within && !url) {
    return {error: `a ${kind} is on the page of the ${WITHIN[kind]} it belongs to: give within, the ${WITHIN[kind]}'s name ("Flame")`};
  }
  const urls = url ? [url] : aonUrls(name, kind, within);
  if (!urls.length) return {found: false, tried: [], hint: `a ${kind} can not be found by name. ${notFoundHint}`};
  const focus = typeof args.focus === 'string' ? args.focus.trim() : '';
  // a page read once in the page's lifetime is not read again: each read is a request against the AI's limits
  const cacheKey = JSON.stringify([name, focus, urls]).toLowerCase();
  const cached = lookups.get(cacheKey);
  if (cached) return cached;
  const pageKind = pageKindOf(kind, urls);
  let result = await readRule(provider, name, focus, urls, pageKind);
  // the provider gave no answer (it stopped it, or a page did not come through): one more read often has it
  if (!result.found && result.blank) result = await readRule(provider, name, focus, urls, pageKind);
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
  pageText.clear();
  pageFacts.clear();
  foundPages.clear();
  pageForName.clear();
  lookups.clear();
  foundByName.clear();
};

const readRule = async (provider: AiProvider, name: string, focus: string, urls: string[], pageKind?: PageKind): Promise<LookupResult & {blank?: boolean}> => {
  const read = await provider.readPages!({instructions: instructions(name, focus, pageKind), urls});
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
  // the links it listed, of the rules sites only: the AI reads one next by its url
  const links = linksOf(rest);
  // the facts of a class page, the latest reading of the page standing for it
  const facts = factsOf(rest);
  if (pageUrl && Object.keys(facts).length) pageFacts.set(pageUrl, facts);
  const notes = rest.filter(line => !LINK_LINE.test(line) && !FACT_LINE.test(line)).join('\n').trim();
  if (pageUrl) pageText.set(pageUrl, [pageText.get(pageUrl), notes].filter(Boolean).join('\n'));
  return {found: true, url: pageUrl, text: notes, ...(links.length ? {links} : {})};
};

// a line the reader gave a link on: "LINK: Flame | https://aonprd.com/MysteryDisplay.aspx?ItemName=Flame"
const LINK_LINE = /^\W*LINK:\s*/i;
export const linksOf = (lines: string[]): {name: string, url: string}[] => {
  const links: {name: string, url: string}[] = [];
  for (const line of lines) {
    if (!LINK_LINE.test(line)) continue;
    const said = line.replace(LINK_LINE, '').trim();
    // the url is the rest of the line: an index's links can hold raw spaces ("Outer Rifts")
    const at = said.search(/https?:\/\//);
    const url = at < 0 ? undefined : said.slice(at).trim().replace(/[)*>\].,]+$/, '').replace(/ /g, '%20');
    if (!url || !isRuleSite(url) || links.some(l => l.url === url)) continue;
    const name = said.slice(0, said.indexOf('http')).replace(/[|:\-–—\s]+$/, '').replace(/^[*_\s]+|[*_\s]+$/g, '').trim() || url;
    links.push({name, url});
  }
  return links.slice(0, 15);
};

// a line the reader gave a fact of a class page on: "FACT: hit die = d8"
const FACT_LINE = /^\W*FACT:\s*/i;
export const factsOf = (lines: string[]): {[fact: string]: string} => {
  const facts: {[fact: string]: string} = {};
  for (const line of lines) {
    if (!FACT_LINE.test(line)) continue;
    const [field, ...value] = line.replace(FACT_LINE, '').split('=');
    const key = field.trim().toLowerCase().replace(/[*_]/g, '');
    if ([...CLASS_FACTS, ...RACE_FACTS, ...FEAT_FACTS, ...TRAIT_FACTS, ...ARCHETYPE_FACTS].includes(key) && value.join('=').trim()) facts[key] = value.join('=').trim().replace(/^[*_"\s]+|[*_"\s]+$/g, '');
  }
  return facts;
};
