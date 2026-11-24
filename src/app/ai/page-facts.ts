import {Proficiencies, featureKey} from '../utils/classlevel.class';
import {KNOWLEDGE_SPECIALTIES} from '../utils/skilllist.class';

// a class level the AI wrote, held against the facts its page was read to give (rules-lookup.ts, CLASS_FACTS): the
// reader reads the page on its own, in a fixed form, so what the AI wrote from memory or misread shows (an oracle went
// in with martial weapons, 75 gp of its 105, Ride for Diplomacy). a fact the reading does not give is not checked,
// a fact read wrong is read again: a new reading of the page replaces it

export interface ClassLevelGiven {
  hitDie?: number;
  skillRanks?: number;
  startingGold?: number;
  classSkills?: string[];
  proficiencies?: Proficiencies;
}

const lower = (value: string): string => value.trim().toLowerCase();
const listOf = (value: string): string[] => /^\s*none\b/i.test(value) ? []
  : value.split(/,|;|\band\b/).map(v => lower(v).replace(/\s*\((str|dex|con|int|wis|cha)\)\s*/g, '').replace(/\.$/, '').trim()).filter(Boolean);

// the average of the starting wealth a page gives: "3d6 x 10 gp" is 105, "(average 105 gp)" 105
export const averageWealth = (said: string): number | undefined => {
  const average = /average[^\d]{0,10}(\d+)/i.exec(said);
  if (average) return Number(average[1]);
  const dice = /(\d+)\s*d\s*(\d+)\s*[x×*]\s*(\d+)/i.exec(said);
  if (dice) return Number(dice[1]) * (Number(dice[2]) + 1) / 2 * Number(dice[3]);
  const plain = /^\s*(\d+)\s*gp/i.exec(said);
  return plain ? Number(plain[1]) : undefined;
};

// a skill as the sheet names it: "Knowledge (all)" is every knowledge, "Craft (Int)" craft
const skillsOf = (said: string[]): Set<string> => new Set(said.flatMap(skill => {
  const plain = skill.replace(/^knowledge\s*\(all\)$/, 'knowledge');
  if (plain === 'knowledge') return KNOWLEDGE_SPECIALTIES.map(spec => `knowledge (${spec.toLowerCase()})`);
  return [plain.replace(/^(craft|perform|profession)\s*\(.*\)$/, '$1')];
}));

const WEAPON_GROUPS = ['simple', 'martial'];
const ARMOR_WORDS: {[word: string]: string} = {light: 'light', medium: 'medium', heavy: 'heavy', shield: 'shield', shields: 'shield', tower: 'tower shield'};
// "shields (except tower shields)" is shields: what it excepts is not one more
const armorOf = (said: string[]): Set<string> => new Set(said.map(a => a.replace(/\(?\bexcept\b[^)]*\)?/g, '')).flatMap(a =>
  Object.entries(ARMOR_WORDS).filter(([word]) => new RegExp(`\\b${word}\\b`).test(a)).map(([, kind]) => kind)));

export const pageFactProblems = (facts: {[fact: string]: string} | undefined, given: ClassLevelGiven): string[] => {
  if (!facts) return [];
  const problems: string[] = [];
  const told = (what: string, page: string, yours: string) =>
    problems.push(`${what}: its page (as read) gives ${page}, not ${yours}. Give what the page says; if the reading is wrong, look the page up again with focus "${what}"`);
  const hitDie = Number(/d\s*(\d+)/i.exec(facts['hit die'] ?? '')?.[1]);
  if (hitDie && given.hitDie && hitDie !== given.hitDie) told('hit_die', `d${hitDie}`, `d${given.hitDie}`);
  const ranks = Number(/(\d+)/.exec(facts['skill ranks'] ?? '')?.[1]);
  if (ranks && given.skillRanks && ranks !== given.skillRanks) told('skill_ranks', `${ranks} + Int modifier`, String(given.skillRanks));
  const wealth = averageWealth(facts['starting wealth'] ?? '');
  if (wealth && given.startingGold && Math.abs(wealth - given.startingGold) > 0.5) told('starting_gold', `${facts['starting wealth']} (${wealth} gp on average)`, `${given.startingGold} gp`);
  if (facts['class skills'] && given.classSkills) {
    const page = skillsOf(listOf(facts['class skills']));
    const yours = skillsOf(given.classSkills.map(lower));
    const left = [...page].filter(s => !yours.has(s) && !(s.startsWith('knowledge') && yours.has('knowledge')));
    const extra = [...yours].filter(s => !page.has(s));
    // "knowledge (all)" written out on one side and not the other is the same
    const knowledgeLeft = left.filter(s => s.startsWith('knowledge'));
    const notKnowledge = left.filter(s => !s.startsWith('knowledge'));
    const missing = [...notKnowledge, ...(knowledgeLeft.length === KNOWLEDGE_SPECIALTIES.length ? ['knowledge (all)'] : knowledgeLeft)];
    if (missing.length || extra.length) {
      problems.push(`class_skills: its page (as read) lists ${facts['class skills']}: ${missing.length ? `add ${missing.join(', ')}` : ''}${missing.length && extra.length ? ', ' : ''}${extra.length ? `leave out ${extra.join(', ')} (a class skill a feature gives, a mystery\'s or a bloodline\'s, goes on that feature as "skills.<skill>.classSkill": true)` : ''}`);
    }
  }
  if (facts['weapon proficiencies'] && given.proficiencies) {
    const page = lower(facts['weapon proficiencies']);
    const yours = given.proficiencies.weapons.map(lower);
    for (const group of WEAPON_GROUPS) {
      const onPage = new RegExp(`\\ball ${group}\\b|\\b${group} weapons\\b|^${group}\\b|, ${group}\\b`).test(page) && !new RegExp(`\\bno ${group}\\b`).test(page);
      if (onPage !== yours.includes(group)) told('weapon_proficiencies', `"${facts['weapon proficiencies']}"`, `"${given.proficiencies.weapons.join(', ')}"`);
    }
  }
  if (facts['armor proficiencies'] && given.proficiencies) {
    const page = armorOf(listOf(facts['armor proficiencies']));
    const yours = armorOf(given.proficiencies.armor.map(lower));
    const differs = [...page].some(a => !yours.has(a)) || [...yours].some(a => !page.has(a));
    if (differs) told('armor_proficiencies', `"${facts['armor proficiencies']}"`, `"${given.proficiencies.armor.join(', ') || 'none'}"`);
  }
  // one refusal per field, however many words differ
  return [...new Set(problems)];
};

// the standard racial traits its page lists that the race the AI gave leaves out: each is a feature of its own, or one
// that replaces it (an alternate trait, whose text says what it replaces). the stats traits (ability scores, size,
// speed, languages, type) are the racial stats. a gnome went without Weapon Familiarity and Obsessive
const STATS_TRAITS = /\b(ability scores?|ability modifiers?|size|speed|languages?|type|subtype|racial stats)\b/i;
const plain = (name: string): string => name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
export const missingRacialTraits = (
  facts: {[fact: string]: string} | undefined,
  features: {name?: string, description?: string, replaces?: string[], adjustments?: {[path: string]: unknown}}[],
): string[] => {
  const listed = facts?.['racial traits'];
  if (!listed || /^\s*none\b/i.test(listed)) return [];
  const names = features.map(f => plain(f.name || ''));
  // a trait named after the stat it is (Darkvision, senses.darkvision) is there wherever it was written: a half-orc's
  // darkvision folded into its racial stats was refused six times as missing
  const stats = features.flatMap(f => Object.keys(f.adjustments || {}))
    .map(path => plain(path.replace(/\[.*$/, '').split('.').pop() || '')).filter(Boolean);
  // what an alternate trait replaces: its replaces, or (a race saved before it) its description's "replaces ..."
  const replaced = features.map(f => [...(f.replaces || []).map(plain),
    plain((String(f.description || '').match(/replaces? ([^.;]+)/i) || [])[1] || '')].join(' ')).join(' ');
  return listed.split(/,|;/).map(t => t.trim()).filter(Boolean).filter(trait => {
    if (STATS_TRAITS.test(trait)) return false;
    const wanted = plain(trait);
    return wanted && !names.some(n => n.includes(wanted) || wanted.includes(n) && n.length > 3) && !replaced.includes(wanted)
      && !stats.includes(wanted);
  });
};

// the alternate racial traits a race page was read to give, each with the standard traits it replaces:
// "Dual Talent (replaces Bonus Feat, Skilled); Eye for Talent (replaces Bonus Feat)"
export const alternateRacialTraits = (facts: {[fact: string]: string} | undefined): Map<string, {name: string, replaces: string[]}> => {
  const said = facts?.['alternate racial traits'];
  const traits = new Map<string, {name: string, replaces: string[]}>();
  if (!said || /^\s*none\b/i.test(said)) return traits;
  for (const part of said.split(';')) {
    const match = /^\s*(.+?)\s*\(\s*replaces?\s+([^)]*)\)/i.exec(part);
    if (!match) continue;
    traits.set(featureKey(match[1]), {name: match[1].trim(), replaces: match[2].split(/,|\band\b/).map(t => t.trim()).filter(Boolean)});
  }
  return traits;
};

// what is wrong with the alternate racial traits of a race (ARG, alternate racial traits), for any race: a trait
// replaced is not there too, two alternates do not replace the same trait, what one replaces is a standard trait of the
// race, and an alternate its page gives replaces what the page says (an alternate taken with the trait it replaces kept
// both bonuses)
export const racialTraitProblems = (
  facts: {[fact: string]: string} | undefined, features: {name?: string, replaces?: string[]}[],
): string[] => {
  const problems: string[] = [];
  const keys = new Map(features.map(f => [featureKey(f.name || ''), f.name || '']));
  const standard = (facts?.['racial traits'] ?? '').split(/,|;/).map(t => featureKey(t)).filter(Boolean);
  const alternates = alternateRacialTraits(facts);
  const replacedBy = new Map<string, string>();
  for (const feature of features) {
    const onPage = alternates.get(featureKey(feature.name || ''));
    const replaces = feature.replaces || [];
    if (onPage && !replaces.length) {
      problems.push(`${feature.name} is an alternate racial trait: give its "replaces", the standard traits it replaces (its page, as read: ${onPage.replaces.join(', ')}), and leave those out`);
    } else if (onPage) {
      const left = onPage.replaces.filter(r => !replaces.some(g => featureKey(g) === featureKey(r)));
      if (left.length) problems.push(`${feature.name} replaces ${left.join(', ')} too (its page, as read): add each to its "replaces" and leave it out. If the reading is wrong, look the page up again with focus "${feature.name}"`);
    }
    for (const replaced of replaces) {
      const key = featureKey(replaced);
      if (keys.has(key) && key !== featureKey(feature.name || '')) {
        problems.push(`${feature.name} replaces ${replaced}, which is among the traits too: an alternate trait takes the place of the one it replaces, leave ${keys.get(key)} out`);
      }
      const other = replacedBy.get(key);
      if (other) problems.push(`${other} and ${feature.name} both replace ${replaced}: a racial trait is replaced once, so the character can not take both`);
      replacedBy.set(key, feature.name || 'a trait');
      if (standard.length && !standard.includes(key) && !STATS_TRAITS.test(replaced)) {
        problems.push(`${feature.name} replaces ${replaced}, which is not a standard racial trait of the race (its page, as read: ${facts!['racial traits']}): give the trait it replaces as the page names it`);
      }
    }
  }
  return problems;
};
