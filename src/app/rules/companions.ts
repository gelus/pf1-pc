import {Character} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';
import {SAVES, babFor, classGroups, saveFor} from './class-progression';

// companions (Core Rulebook: the druid's animal companion, the wizard's familiar, the paladin's mount; Advanced
// Player's Guide: the eidolon; the Leadership feat's cohort): each a character of its own, with a sheet of its own,
// linked to its master. what a companion's rules read from its master (its master's levels, hit points, base saves,
// skill ranks) is copied onto the companion and refreshed whenever the master changes (CharacterRegistry), so every
// sheet stays worked out from its own data alone, and undoing a change of the master never changes a companion behind
// its back

export type CompanionKind = 'cohort' | 'familiar' | 'animal companion' | 'mount' | 'eidolon';
export const COMPANION_KINDS: CompanionKind[] = ['cohort', 'familiar', 'animal companion', 'mount', 'eidolon'];

// what a companion keeps of its master, as it was when last refreshed
export interface MasterCopy {
  name: string;
  level: number;
  // its levels in each class, by the class's name
  classes: {[className: string]: number};
  // its max hit points, base attack bonus, and base saves from its class levels alone
  hp: number;
  bab: number;
  baseSaves: {fort: number, ref: number, will: number};
  // its ranks in each skill (a familiar uses them)
  skillRanks: {[skill: string]: number};
}

export interface CompanionLink {
  masterId: string;
  kind: CompanionKind;
  copy?: MasterCopy;
  // the master's classes whose levels count for it (a familiar's master class level: a wizard's and a witch's levels
  // stack), by their names as the master has them
  classes?: string[];
  // added to the master class level for its own (an animal companion's effective druid level: a ranger's is its
  // ranger level - 3), as the class feature granting it says
  levelOffset?: number;
  // the abilities its ability score increases raised, in the order of the levels that give them (an animal
  // companion's at 4th, 9th, 14th and 19th)
  increases?: string[];
  // the abilities of its kind the class feature granting it takes away (a cavalier's mount: Share Spells), by name
  without?: string[];
  // an eidolon: the saves its base form makes good (a biped's Fortitude and Will), and whether it is the Unchained
  // summoner's (a smaller evolution pool, weapon attacks counted against its max attacks)
  goodSaves?: ('fort' | 'ref' | 'will')[];
  unchained?: boolean;
  // an eidolon its summoner fuses with (the synthesist, Ultimate Magic): its summoner gets a Fused form whose numbers
  // are the eidolon's (rules/synthesist.ts)
  synthesist?: boolean;
}

// a companion whose levels come from its master (a familiar, an animal companion, a mount, an eidolon): it never
// levels up on its own. a cohort is a character that levels like any other
export const advancesWithMaster = (char: {master?: CompanionLink}): boolean => !!char.master && char.master.kind !== 'cohort';

// the companion's own level: its master class level with the offset the class feature gives (an animal companion's
// effective druid level), 0 below 1st
export const companionLevel = (link: CompanionLink | undefined): number =>
  Math.max(0, masterClassLevel(link) + (Number(link?.levelOffset) || 0));

// an animal companion's (and a mount's) ability score increases: at these effective druid levels
export const INCREASE_LEVELS = [4, 9, 14, 19];
export const hasAnimalTable = (link: CompanionLink | undefined): boolean => link?.kind === 'animal companion' || link?.kind === 'mount';
// the levels a companion's own table gives an ability score increase at (an eidolon's 5th, 10th and 15th)
export const increaseLevelsOf = (link: CompanionLink | undefined): number[] =>
  hasAnimalTable(link) ? INCREASE_LEVELS : link?.kind === 'eidolon' ? [5, 10, 15] : [];

// the ability score increases its level gives that the player has not picked
export const owedCompanionIncreases = (raw: {master?: CompanionLink}): number => {
  const link = raw.master;
  const levels = increaseLevelsOf(link);
  if (!levels.length) return 0;
  return Math.max(0, levels.filter(l => l <= companionLevel(link)).length - (link!.increases || []).length);
};

// the master's levels in the classes that count for a companion (its master class level)
export const masterClassLevel = (link: CompanionLink | undefined): number => {
  if (!link?.copy) return 0;
  const counted = new Set((link.classes || []).map(c => c.trim().toLowerCase()));
  return Object.entries(link.copy.classes).filter(([name]) => counted.has(name.toLowerCase())).reduce((sum, [, n]) => sum + n, 0);
};

// the copy of a master a companion keeps: worked out from the master's raw and applied character
export const masterCopyOf = (raw: Character, applied: Character): MasterCopy => {
  const groups = classGroups(raw.classLevels || []);
  const baseSaves = {fort: 0, ref: 0, will: 0};
  let bab = 0;
  for (const group of groups) {
    const first = group.entries.find(e => e.babProgression) ?? group.entries[0];
    if (first?.babProgression) bab += babFor(first.babProgression, group.entries.length);
    const good = group.entries.find(e => e.goodSaves)?.goodSaves || [];
    const prestige = group.entries.some(e => e.prestige);
    for (const save of SAVES) baseSaves[save] += saveFor(good.includes(save), group.entries.length, prestige);
  }
  const skillRanks: {[skill: string]: number} = {};
  for (const [name, skill] of Object.entries(raw.skills || {})) {
    if ((skill?.ranks || 0) > 0) skillRanks[name] = skill.ranks;
    for (const [sub, s] of Object.entries(skill?.subSkills || {})) if ((s?.ranks || 0) > 0) skillRanks[`${name} (${sub})`] = s.ranks;
  }
  return {
    name: raw.name, level: characterLevel(raw),
    classes: Object.fromEntries(groups.map(g => [g.name, g.entries.length])),
    hp: Number(applied.hp) || 0, bab, baseSaves, skillRanks,
  };
};

// the warnings a companion's kind has for it (never refusals: the table decides), from its copy of its master. a
// cohort is at least two levels below its leader (the Leadership feat; its table of what score leads to what cohort
// level is on the feat's page)
export const companionWarnings = (raw: Character): string[] => {
  const link = raw.master;
  if (!link?.copy) return [];
  const level = characterLevel(raw);
  if (link.kind === 'cohort' && level > link.copy.level - 2) {
    return [`a cohort is at least 2 levels below its leader: ${raw.name} is level ${level}, ${link.copy.name} level ${link.copy.level}`];
  }
  if (advancesWithMaster(raw) && !masterClassLevel(link)) {
    return [`${raw.name} counts none of ${link.copy.name}'s class levels: say which classes grant the ${link.kind} (${Object.keys(link.copy.classes).join(', ') || 'it has none'})`];
  }
  const owed = owedCompanionIncreases(raw);
  if (owed) return [`${raw.name} has ${owed} ability score increase${owed > 1 ? 's' : ''} of its level to pick`];
  return [];
};

// what a companion is, in a line, for the AI and the sheet: "the cohort of Nairabrab (level 7)"
export const companionLine = (raw: Character): string | undefined => {
  const link = raw.master;
  if (!link) return undefined;
  const level = advancesWithMaster(raw) && link.classes?.length ? `${link.classes.join('/')} ${masterClassLevel(link)}` : link.copy ? `level ${link.copy.level}` : '';
  return `the ${link.kind} of ${link.copy?.name ?? 'its master'}${level ? ` (${level})` : ''}`;
};

export const sameCopy = (a: MasterCopy | undefined, b: MasterCopy): boolean => JSON.stringify(a ?? null) === JSON.stringify(b);
