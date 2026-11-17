import {abilityModifier} from '../ability-mod.pipe';
import {Skill} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {getByPath} from '../utils/object.util';

// how the sheet totals a stat: what the applied character holds at the path, the modifiers of its abilities (a
// capped dex bonus, a denied one left out), the numbers the sheet adds (base 10, bab, ranks, ...) and the bonuses
// every stat of its kind takes (saving throw bonus, skill check bonus, armor check penalty). the stat component
// shows this total, and the AI reads it, so both give the same number

export interface StatSpec {
  // the path of the stat on the applied character (ac, saves.will, skills.stealth.value, ...), none for a total made
  // only of what is added (an attack bonus worked out by the attacks rule)
  stat?: string;
  // the abilities whose modifiers it takes
  abilities?: string[];
  // what the sheet adds on top, [number, what it is]
  additional?: Array<[number, string]>;
  // caps the ability bonus (the max dex bonus of armor), undefined when nothing caps it
  maxAbilityBonus?: number;
}

// the skill a stat path is the value of: skills.<skill>.value or skills.<family>.subSkills.<skill>.value
export const skillOfStatPath = (char: Character, statPath: string): Skill | undefined => {
  const sub = /^skills\.([^.]+)\.subSkills\.([^.]+)\.value$/.exec(statPath);
  if (sub) return char.skills?.[sub[1]]?.subSkills?.[sub[2]];
  const skill = /^skills\.([^.]+)\.value$/.exec(statPath);
  return skill ? char.skills?.[skill[1]] : undefined;
};

export const isSkillStat = (stat: string): boolean => stat.startsWith('skills.') && stat.endsWith('.value');

// a str or dex skill takes the armor check penalty
export const isStrOrDexSkillStat = (char: Character, stat: string): boolean => {
  if (!isSkillStat(stat)) return false;
  const ability = (skillOfStatPath(char, stat)?.baseAbility || '').toLowerCase();
  return ability === 'str' || ability === 'dex';
};

// whether the stat loses the dex bonus of the character (flat-footed, denied by a condition, ...)
export const isDexBonusDenied = (stat: string | undefined, char: Character): boolean => {
  if (!stat || !char?.denyDexBonus) return false;
  if (stat === 'ac' || stat === 'touchAc' || stat === 'flatFootedAc') return Boolean(char.denyDexBonus.ac);
  if (stat === 'cmd') return Boolean(char.denyDexBonus.cmd);
  return false;
};

// the modifier an ability gives the stat, capped and with the penalty of its damage. 0 for a denied dex bonus (a dex
// penalty still applies)
export const statAbilityModifier = (char: Character, spec: StatSpec, ability: string): number => {
  const mod = abilityModifier(char, ability, spec.maxAbilityBonus ?? Infinity);
  return ability === 'dex' && mod > 0 && isDexBonusDenied(spec.stat, char) ? 0 : mod;
};

export const statTotal = (char: Character, spec: StatSpec): number => {
  const stat = spec.stat || '';
  const found = stat ? getByPath(char, stat) ?? 0 : 0;
  const raw = found?.value ?? found;
  let total = typeof raw === 'number' ? raw : Number(raw) || 0;
  for (const ability of spec.abilities || []) {
    if (char.abilityScores?.[ability as keyof Character['abilityScores']] !== undefined) {
      total += statAbilityModifier(char, spec, ability);
    }
  }
  for (const [value] of spec.additional || []) total += value || 0;
  if (stat.startsWith('saves.')) {
    total += char.savingThrowBonus || 0;
  } else if (isSkillStat(stat)) {
    total += char.skillCheckBonus || 0;
    if (isStrOrDexSkillStat(char, stat)) total += char.armorCheckPenalty || 0;
  }
  return total;
};

// what the sheet adds to a skill: its ranks and the class skill bonus
export const skillAdditional = (skill: Skill | undefined): Array<[number, string]> => {
  if (!skill) return [];
  return [
    [skill.ranks || 0, 'ranks'],
    [skill.classSkill && skill.ranks > 0 ? 3 : 0, 'class skill'],
  ];
};
