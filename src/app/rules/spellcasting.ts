import {InjectionToken} from '@angular/core';
import {CasterType, ClassSpellcasting, Feature, Spell, SpellLevel} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {abilityModifier} from '../ability-mod.pipe';
import {ClassGroup, classGroups} from './class-progression';
import {RuleModule, ruleFeature} from './rule-module';
import {bonusSpells, castableSpellLevels, spellsKnown, spellsPerDay} from './spell-tables';

// Pathfinder 1e spellcasting from classes (Core Rulebook, chapter 9 and the class descriptions of chapter 3)
//
// a class whose levels give ClassLevel.spellcasting (see class-presets.ts) is a caster of its own, spells.<origin>:
//  - its caster level (and the caster level part of concentration) is its level in the class plus casterLevelOffset
//    (paladin and ranger: -3), a multiclass character has one caster per class, each with its own levels
//  - its spell levels are the spell levels its table gives at that class level, with the spells per day of the
//    table (base) and the bonus spells of its casting ability modifier (bonus, table 1-3). a level the table gives 0
//    for still gets bonus spells, a level it gives '—' for gets none (it does not exist yet)
//  - its 0-level spells are cast at will (atWill), a prepared caster still prepares the number the table gives
//  - a spontaneous caster knows at most the spells known of its table (known)
//  - a cleric has one domain slot, a specialist wizard one school slot, per spell level from 1st on up (extraSlot)
// features add to the caster as to any other (spells.<origin>.casterLevel, spells.<origin>.spells.1.perDay.total...)
//
// every caster with a casting ability (class or not) gets, on the applied character:
//  - maxSpellLevel: its casting ability score - 10, it can not cast spells of a higher level
//  - dc of every spell level: 10 + spell level + casting ability modifier + spells.<origin>.dcBonus, and dc of every
//    spell: the level's plus spellSchoolDcBonus.<school> (Spell Focus (evocation): spellSchoolDcBonus.evocation: 1)
//  - arcaneSpellFailure (arcane casters): the arcane spell failure chance of the character, without that of the
//    armor the class ignores it from (bard: light armor)
// the slots spent of a class caster are counted on the raw caster (SpellLevel.used, extraUsed), taken off here

// rolls d%, 1 to 100. provide a function of your own to fix the roll (in a spec)
export const PERCENTILE_ROLL = new InjectionToken<() => number>('percentile roll', {
  providedIn: 'root',
  factory: () => () => Math.floor(Math.random() * 100) + 1,
});

export interface ClassCaster {
  group: ClassGroup;
  info: ClassSpellcasting;
  classLevel: number;
  casterLevel: number;
}

const lower = (value: string | undefined): string => (value || '').trim().toLowerCase();

// the spellcasting classes of the character, the first entry of a class that gives spellcasting counts
export const classCasters = (raw: Pick<Character, 'classLevels'>): ClassCaster[] =>
  classGroups(raw.classLevels).flatMap(group => {
    const info = group.entries.find(entry => entry.spellcasting?.origin)?.spellcasting;
    if (!info) return [];
    const classLevel = group.entries.length;
    // a class that can not cast any spell yet (a paladin below 4th level) is no caster yet
    if (!castableSpellLevels(info.table, classLevel).length) return [];
    return [{group, info, classLevel, casterLevel: Math.max(0, classLevel + (info.casterLevelOffset || 0))}];
  });

// the highest spell level a casting ability score allows: a caster needs a score of 10 + the spell level
export const maxSpellLevelFor = (score: number): number => Math.floor(Number(score) || 0) - 10;

// the save DC of the spells of a level of the caster, and of one spell (its school adds spellSchoolDcBonus)
export const spellLevelDc = (char: Character, caster: CasterType, spellLevel: number): number =>
  10 + spellLevel + (caster.ability ? abilityModifier(char, lower(caster.ability)) : 0) + (Number(caster.dcBonus) || 0);

export const spellDc = (char: Character, caster: CasterType, spellLevel: number, spell: Pick<Spell, 'school'>): number =>
  spellLevelDc(char, caster, spellLevel) + (Number(char.spellSchoolDcBonus?.[lower(spell.school)]) || 0);

// whether a spell asks for a saving throw, its DC only matters then
export const hasSavingThrow = (spell: Pick<Spell, 'savingThrow'>): boolean => {
  const save = lower(spell.savingThrow);
  return !!save && save !== 'none' && save !== '-' && save !== '—';
};

const numberOf = (adjustment: any): number =>
  Number(adjustment && typeof adjustment === 'object' ? adjustment.value : adjustment) || 0;

// the arcane spell failure the equipped armor of these categories (Item.proficiency) gives
export const ignoredArmorSpellFailure = (char: Character, categories: string[] = []): number => {
  const ignored = categories.map(lower);
  if (!ignored.length) return 0;
  return (char.inventory || [])
    .filter(item => item.equipped && ignored.includes(lower((item as any).proficiency)))
    .flatMap(item => item.features || [])
    .filter(feature => feature?.active !== false)
    .reduce((sum, feature) => sum + numberOf(feature.adjustments?.['arcaneSpellFailureChance']), 0);
};

// the arcane spell failure chance a caster's spells with a somatic component have
export const casterArcaneSpellFailure = (char: Character, caster: CasterType): number => {
  if (!caster.arcane) return 0;
  const chance = (Number(char.arcaneSpellFailureChance) || 0) - ignoredArmorSpellFailure(char, caster.ignoreArmorSpellFailure);
  return Math.max(0, chance);
};

// the chance a spell fails as it is cast (Core Rulebook, arcane spell failure; deafened): the arcane spell failure of
// the caster when the spell has a somatic component, plus the spell failure chance of the character for any spell,
// plus the verbal variant of it (spellFailureChance[verbal], deafened) when the spell has a verbal component
export const spellFailureChanceFor = (
  char: Character, caster: CasterType, spell: Pick<Spell, 'components'>, verbalFailure = 0,
): number => {
  const components = (spell.components || []).map(component => lower(component));
  const somatic = components.some(component => component === 's');
  const verbal = components.some(component => component === 'v');
  const chance = (somatic ? casterArcaneSpellFailure(char, caster) : 0)
    + (Number(char.spellFailureChance) || 0)
    + (verbal ? verbalFailure : 0);
  return Math.min(100, Math.max(0, chance));
};

// whether a spell can go into the extra slot of a caster: a domain spell of one of its domains (any domain when it
// has none set), or a spell of its specialty school
export const fitsExtraSlot = (caster: CasterType, spell: Pick<Spell, 'school' | 'domain'> | undefined): boolean => {
  if (!spell) return false;
  if (caster.domainSlots) {
    if (!lower(spell.domain)) return false;
    const domains = (caster.domains || []).map(lower).filter(Boolean);
    return !domains.length || domains.includes(lower(spell.domain));
  }
  if (caster.specialistSchool) return !!lower(caster.school) && lower(spell.school) === lower(caster.school);
  return false;
};

// whether a spell is of an opposition school of a specialist wizard: preparing it takes two slots
export const isOppositionSpell = (caster: CasterType, spell: Pick<Spell, 'school'> | undefined): boolean =>
  !!spell && (caster.oppositionSchools || []).map(lower).includes(lower(spell.school));

// how many regular slots the prepared spells of a level take
export const preparedSlotsUsed = (caster: CasterType, level: SpellLevel | undefined): number =>
  (level?.prepared || []).filter(prepared => prepared.slot !== 'extra').reduce((sum, prepared) => {
    const spell = level!.spells.find(({name}) => lower(name) === lower(prepared.name));
    return sum + (isOppositionSpell(caster, spell) ? 2 : 1);
  }, 0);

const hasExtraSlot = (caster: CasterType): 'domain' | 'school' | undefined => {
  if (caster.domainSlots) return 'domain';
  if (caster.specialistSchool && lower(caster.school) && lower(caster.school) !== 'universalist') return 'school';
  return undefined;
};

const casterFeatures = (raw: Character): Feature[] => classCasters(raw).map(({group, info, classLevel, casterLevel}) => {
  const path = `spells.${info.origin}`;
  const adjustments: Feature['adjustments'] = {
    [path]: {
      name: group.name,
      ability: lower(info.ability),
      casting: info.type,
      arcane: !!info.arcane,
      classTable: info.table,
      classLevel,
      ...(info.domainSlots ? {domainSlots: true} : {}),
      ...(info.specialistSchool ? {specialistSchool: true} : {}),
      ...(info.ignoreArmorSpellFailure?.length ? {ignoreArmorSpellFailure: [...info.ignoreArmorSpellFailure]} : {}),
      spells: [],
    },
    [`${path}.casterLevel`]: casterLevel,
    [`${path}.concentration`]: casterLevel,
  };
  for (const level of castableSpellLevels(info.table, classLevel)) {
    const base = spellsPerDay(info.table, classLevel, level) || 0;
    adjustments[`${path}.spells.${level}.perDay.total`] = base;
    adjustments[`${path}.spells.${level}.perDay.current`] = base;
  }
  return ruleFeature(`${group.name} ${classLevel} (spellcasting)`, adjustments);
});

// bonus spells take the final casting ability of the character (a headband raises it)
const bonusSpellFeatures = (raw: Character, applied: Character): Feature[] => classCasters(raw).flatMap(({info, classLevel}) => {
  const ability = lower(info.ability);
  const modifier = abilityModifier(applied, ability);
  const adjustments: Feature['adjustments'] = {};
  for (const level of castableSpellLevels(info.table, classLevel)) {
    // a level the table gives '—' for gets no bonus spells, and 0-level spells never get any
    if (spellsPerDay(info.table, classLevel, level) === null) continue;
    const bonus = bonusSpells(modifier, level);
    if (!bonus) continue;
    adjustments[`spells.${info.origin}.spells.${level}.perDay.total`] = bonus;
    adjustments[`spells.${info.origin}.spells.${level}.perDay.current`] = bonus;
  }
  if (!Object.keys(adjustments).length) return [];
  const label = ability.charAt(0).toUpperCase() + ability.slice(1);
  return [ruleFeature(`${label} ${applied.abilityScores?.[ability] ?? 10} (${info.origin} bonus spells)`, adjustments)];
});

const annotateClassLevel = (applied: Character, caster: CasterType, level: SpellLevel, index: number): void => {
  const table = caster.classTable!;
  const classLevel = caster.classLevel || 0;
  const perDay = spellsPerDay(table, classLevel, index);
  if (perDay === null && spellsKnown(table, classLevel, index) === null) return;
  level.base = perDay || 0;
  level.bonus = perDay === null ? 0 : bonusSpells(abilityModifier(applied, lower(caster.ability)), index);
  const known = spellsKnown(table, classLevel, index);
  if (known !== null) level.known = known;
  if (index === 0) level.atWill = true;
  const kind = index > 0 ? hasExtraSlot(caster) : undefined;
  if (kind) {
    const used = Number(level.extraUsed) || 0;
    level.extraSlot = {kind, total: 1, current: Math.max(0, 1 - used), label: kind === 'domain' ? 'domain' : `school (${caster.school})`};
  }
};

const finalizeCaster = (applied: Character, caster: CasterType, spells: boolean): void => {
  if (!caster) return;
  if (spells && caster.ability) {
    caster.maxSpellLevel = maxSpellLevelFor(applied.abilityScores?.[lower(caster.ability)] ?? 10);
  }
  if (spells && caster.arcane) caster.arcaneSpellFailure = casterArcaneSpellFailure(applied, caster);
  (caster.spells || []).forEach((level, index) => {
    if (!level) return;
    const used = Number(level.used) || 0;
    if (used) level.perDay.current = Math.max(0, level.perDay.current - used);
    if (caster.classTable) annotateClassLevel(applied, caster, level, index);
    if (!caster.ability) return;
    level.dc = spellLevelDc(applied, caster, index);
    // only a spell that allows a saving throw has a dc (produce flame, an attack, has none)
    for (const spell of level.spells || []) {
      if (hasSavingThrow(spell)) spell.dc = spellDc(applied, caster, index, spell);
      else delete spell.dc;
    }
  });
};

export const spellcastingRule: RuleModule = {
  name: 'spellcasting',
  base: (raw) => casterFeatures(raw),
  final: (raw, applied) => bonusSpellFeatures(raw, applied),
  finalize: (_raw, applied) => {
    for (const caster of Object.values(applied.spells || {})) finalizeCaster(applied, caster, true);
    for (const caster of Object.values(applied.spellLikeAbilities || {})) finalizeCaster(applied, caster, false);
  },
};
