import {Feature} from '../interfaces/character.interface';
import {allowsAlignment} from './alignments';
import {Character} from '../utils/character.class';

// a feat's prerequisites as rules write them ("Str 13, base attack bonus +1, Power Attack"), checked against a
// character: what it does not meet. ability scores, base attack bonus, and the feats and class features it names (by
// their names). what is written otherwise (a skill's ranks, "proficiency with the weapon") is left to the player.
// the AI's builders check a feat as it is added; retraining checks every feat the character keeps (retraining.ts)
const ABILITY_NAMES: {[short: string]: string} = {str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha'};

const partsOf = (written: string): string[] =>
  written.split(/[,;]|\band\b/).map(p => p.trim().replace(/\.$/, '')).filter(Boolean);

// a part that names a feature: "Power Attack", "rage class feature"
const featureNamed = (part: string): string | undefined => {
  const classFeature = /^(.+?)\s+class (feature|ability)$/i.exec(part);
  const featName = /^[A-Z][\w'’-]*( [A-Z(][\w'’()-]*){0,4}$/.test(part) && !/\d/.test(part) ? part : undefined;
  return (classFeature?.[1] || featName || '').toLowerCase() || undefined;
};
const sameFeature = (wanted: string, name: string): boolean =>
  name.includes(wanted) || (wanted.length > 4 && wanted.includes(name) && name.length > 4);

// the names of what the character has that a prerequisite can name
const featureNames = (applied: Character, leaving?: Feature): Set<string> => {
  const names = (features: Feature[] = []) => features.filter(f => f !== leaving).map(f => (f.name || '').toLowerCase());
  return new Set([
    ...names(applied.feats),
    ...(applied.classLevels || []).flatMap(l => names(l.features)),
    ...names(applied.specialAttack), ...names(applied.defensiveAbilities), ...names(applied.specialQuality),
    ...names(applied.race?.features),
  ]);
};

export const unmetPrerequisitesOf = (applied: Character, written: string): string[] => {
  const unmet: string[] = [];
  const has = featureNames(applied);
  for (const part of partsOf(written)) {
    const ability = /^(str|dex|con|int|wis|cha)[a-z]*\s+(\d+)$/i.exec(part);
    if (ability) {
      const score = Number((applied.abilityScores as any)?.[ABILITY_NAMES[ability[1].toLowerCase()]]);
      if (score < Number(ability[2])) unmet.push(`${part} (the character has ${score})`);
      continue;
    }
    const bab = /^(base attack bonus|bab)\s*\+?(\d+)$/i.exec(part);
    if (bab) {
      if (Number(applied.bab) < Number(bab[2])) unmet.push(`${part} (the character has +${applied.bab})`);
      continue;
    }
    const wanted = featureNamed(part);
    if (wanted && ![...has].some(name => sameFeature(wanted, name))) unmet.push(`${part} (the character does not have it)`);
  }
  return unmet;
};

// the ranks a character has in a skill by the name rules write it: "Stealth", "Knowledge (arcana)", "Perform (any)"
const ranksIn = (applied: Character, said: string): number | undefined => {
  const name = said.trim().toLowerCase();
  const family = /^(\w+) \((.+)\)$/.exec(name);
  if (family) {
    const subs = applied.skills?.[family[1]]?.subSkills || {};
    if (/^(any|one)\b/.test(family[2])) return Math.max(0, ...Object.values(subs).map(s => Number(s?.ranks) || 0));
    const sub = Object.entries(subs).find(([key]) => key.toLowerCase() === family[2]);
    return sub ? Number(sub[1]?.ranks) || 0 : applied.skills?.[family[1]] ? 0 : undefined;
  }
  return applied.skills?.[name] ? Number(applied.skills[name].ranks) || 0 : undefined;
};

// the highest spell level a character casts, of arcane, divine or any spells (its casters as the rules worked them out)
const highestSpellLevel = (applied: Character, magic?: string): number => Math.max(-1, ...Object.values(applied.spells || {})
  .filter(caster => !magic || (magic === 'arcane') === !!caster?.arcane)
  .map(caster => (caster?.spells || []).reduce((top, level, index) => level && (level.perDay?.total > 0 || (level.known ?? 0) > 0 || level.atWill)
    && (caster.maxSpellLevel === undefined || index <= caster.maxSpellLevel) ? index : top, -1)));

// a prestige class's requirements as its page lists them ("Alignment: any evil. Skills: Knowledge (arcana) 5 ranks,
// Stealth 5 ranks. Feats: Dodge. Spells: Able to cast 2nd-level arcane spells."), checked against a character: what it
// does not meet. on top of a feat's prerequisites: an alignment, ranks in a skill, a level of spells it casts. what is
// written otherwise ("Special: must have slain a dragon") is left to the player
export const unmetRequirementsOf = (applied: Character, written: string): string[] => {
  const unmet: string[] = [];
  const parts: string[] = [];
  for (const clause of written.split(/[.;]\s+|[.;]$|\n/).map(c => c.trim()).filter(Boolean)) {
    const labelled = /^(alignment|skills?|feats?|spells?|base attack bonus|special|race|abilities)\s*:\s*(.+)$/i.exec(clause);
    const label = labelled?.[1].toLowerCase() ?? '';
    const body = labelled ? labelled[2] : clause;
    if (label === 'alignment') {
      if (!allowsAlignment(body, String(applied.alignment))) unmet.push(`alignment ${body} (the character is ${applied.alignment})`);
      continue;
    }
    if (label === 'special') continue;
    if (label === 'base attack bonus') { parts.push(`base attack bonus ${body.trim()}`); continue; }
    parts.push(...(label === 'spells' ? [body] : body.split(/,|\band\b/).map(p => p.trim()).filter(Boolean)));
  }
  const rest: string[] = [];
  for (const part of parts) {
    const skill = /^(.+?)\s+(\d+)\s+ranks?$/i.exec(part);
    if (skill) {
      const ranks = ranksIn(applied, skill[1]);
      if (ranks !== undefined && ranks < Number(skill[2])) unmet.push(`${part} (the character has ${ranks})`);
      continue;
    }
    const spells = /(?:able to )?cast (\d+)(?:st|nd|rd|th)[- ]level (arcane |divine )?spells/i.exec(part);
    if (spells) {
      const highest = highestSpellLevel(applied, spells[2]?.trim().toLowerCase());
      if (highest < Number(spells[1])) unmet.push(`${part} (the character casts ${highest >= 0 ? `up to ${highest}-level` : 'no'} ${spells[2] ?? ''}spells)`);
      continue;
    }
    rest.push(part);
  }
  return [...unmet, ...(rest.length ? unmetPrerequisitesOf(applied, rest.join(', ')) : [])];
};

// the feats whose prerequisites name a feature (Cleave names Power Attack): retraining that feature away leaves them
// without a prerequisite (Ultimate Campaign: a prerequisite of something else is retrained after it)
export const dependentsOf = (applied: Character, feature: {name?: string}): string[] => {
  const name = (feature.name || '').toLowerCase();
  if (!name) return [];
  return (applied.feats || []).filter(f => f.name?.toLowerCase() !== name && f.prerequisites
    && partsOf(f.prerequisites).some(part => {
      const wanted = featureNamed(part);
      return !!wanted && sameFeature(wanted, name);
    })).map(f => f.name || 'a feat');
};

// the feats the character keeps whose prerequisites it does not meet: it can not use them until it does again
// (Ultimate Campaign, retraining). a feat saved before its prerequisites were kept is not checked
export const unqualifiedFeats = (applied: Character): string[] =>
  (applied.feats || []).filter(f => f.prerequisites && !/^\s*none\b/i.test(f.prerequisites)).flatMap(f => {
    const unmet = unmetPrerequisitesOf(applied, f.prerequisites!);
    return unmet.length ? [`${f.name}: ${unmet.join('; ')}, it can not be used until the character qualifies again`] : [];
  });
