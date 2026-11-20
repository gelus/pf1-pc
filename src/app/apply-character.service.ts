import { Injectable, Signal, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import {Character, defaultCombatOptions} from './utils/character.class';
import {ls} from './utils/localstorage.util';
import {
  AdjustmentMode,
  CasterType,
  bonusStackingKey,
  Feature,
  Skill,
  SkillObj,
  Spell,
  SpellCasting,
  SpellLevel,
  dexBonusTypes,
  flatFootedAcIgnoredBonusTypes,
  touchAcIgnoredBonusTypes,
} from './interfaces/character.interface';
import {assignByPath, evaluateVal, getByPath, isCalculatedString, setByPath} from './utils/object.util';
import {Item} from './utils/item.class';
import {
  KNOWLEDGE_SPECIALTIES,
  OPEN_SKILL_FAMILIES,
  SKILL_FAMILIES,
  isOpenSkillFamily,
  isSkillFamily,
  skillAbilityMap,
} from './utils/skilllist.class';
import {
  CONDITION_INCLUSIONS,
  CONDITION_SEVERITY_GROUPS,
  ConditionsService,
} from './conditions.service';
import {v4} from 'uuid';
import {carryingCapacity, loadFor, purseWeight, reducedSpeed} from './utils/encumbrance.util';
import {RuleContext, RuleModule, conditionKey} from './rules/rule-module';
import {RULE_MODULES} from './rules';
import {
  FEATURE_LIST_LOCATIONS, SpellCastingType, rawSpellArrays, rawSpellLevelSources, restSpellLevel,
} from './rules/spell-sources';
import {RestOptions, RestSummary, restChange} from './rules/rest';
import {tagItemAttacks} from './rules/attacks.util';
import {defaultTwoWeaponFighting} from './utils/attack.class';
import {CharacterHistory} from './utils/character-history';
import {PERCENTILE_ROLL, fitsExtraSlot, isOppositionSpell, preparedSlotsUsed, spellFailureChanceFor} from './rules/spellcasting';
import {damageReductionMap, migrateDamageReduction, migrateDamageReductionAdjustments} from './rules/defenses';

// AdjustmentMapArray is used to track what adjustments apply to a stat
// its an array, but can have additional bonus type properties to track which adjustment is being applied per bonus
export type AdjustmentMapArray = AdjustmentMapEntry[] & { [key: string]: AdjustmentMapEntry };
export interface AdjustmentMapEntry {
  adjusting: string;
  origin: string;
  value: any;
  type: string;
  overwritten: boolean;
  variant?: string;
  // only present for adjustments that do not add, see AdjustmentMode
  mode?: Exclude<AdjustmentMode, 'add'>;
}

export interface VariantEntryView {
  entry: AdjustmentMapEntry;
  overwritten: boolean;
}

export interface VariantSummary {
  name: string;
  total: number | 'auto-fail';
  entries: VariantEntryView[];
}

interface DeferredSkillSelectorAdjustment {
  pathWithoutVariant: string;
  variant?: string;
  origin: string;
  value: any;
  type: string;
  mode?: Exclude<AdjustmentMode, 'add'>;
}

interface ConditionCandidate {
  feature: Feature;
  rawIndex: number;
  includedBy?: Set<ConditionCandidate>;
  suppressed?: boolean;
}

const byId = (id: string) => (f: any): boolean => f.id === id;
export type {SpellCastingType} from './rules/spell-sources';

// what came of casting a spell: spent when it used its slot, success when it took effect. a spell failure roll is
// given with the chance it was rolled against, reason says why it was not cast or failed
export interface CastResult {
  spell: string;
  origin: string;
  level: number;
  spent: boolean;
  success: boolean;
  roll?: number;
  chance?: number;
  reason?: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// the name a new feature gets until it is named (see Feature)
export const PLACEHOLDER_FEATURE_NAME = new Feature().name;

// an item's feature left unnamed (armor made in the item form has one) goes by the item's name, so the tooltips say
// where a number comes from: "-4 A Sick Hat", not "-4 A New Feature". the applied item is a copy, the raw one keeps
// its name
const namedAfterItem = (item: {name: string}, features: Feature[]): Feature[] => {
  for (const feature of features) {
    if (feature && (!feature.name?.trim() || feature.name === PLACEHOLDER_FEATURE_NAME)) feature.name = item.name;
  }
  return features;
};
const emptySpellLevel = (): SpellLevel => ({perDay: {current: 0, total: 0}, spells: []});
const emptyCaster = (): CasterType => ({
  name: '',
  ability: '',
  casterLevel: 0,
  concentration: 0,
  spells: [],
});

const FEATURE_CONTAINER_KEYS = new Set([
  'specialAttack',
  'defensiveAbilities',
  'specialQuality',
  'feats',
  'conditions',
  'race.features',
  'traits',
  'drawbacks',
]);

const isAdjustmentWrapperObject = (val: any): boolean =>
  val !== null &&
  typeof val === 'object' &&
  !Array.isArray(val) &&
  'value' in val &&
  !('adjustments' in val) &&
  !('damage' in val) &&
  !('casterLevel' in val) &&
  !('spells' in val);

const checkConditionals = (rawAdj: any, activeFeatureNames: Set<string>): boolean => {
  if (!isAdjustmentWrapperObject(rawAdj)) return true;
  if (rawAdj.if !== undefined) {
    const required = Array.isArray(rawAdj.if) ? rawAdj.if : [rawAdj.if];
    if (!required.every((name: any) => activeFeatureNames.has(String(name).trim().toLowerCase()))) {
      return false;
    }
  }
  if (rawAdj.unless !== undefined) {
    const forbidden = Array.isArray(rawAdj.unless) ? rawAdj.unless : [rawAdj.unless];
    if (forbidden.some((name: any) => activeFeatureNames.has(String(name).trim().toLowerCase()))) {
      return false;
    }
  }
  return true;
};

// the mode of an adjustment, adjustments that add (the default) have none
const modeOf = (rawAdj: any): Exclude<AdjustmentMode, 'add'> | undefined => {
  if (!isAdjustmentWrapperObject(rawAdj)) return undefined;
  return rawAdj.mode === 'set' || rawAdj.mode === 'min' || rawAdj.mode === 'max' ? rawAdj.mode : undefined;
};

// half and reduced mark a speed to be slowed once everything else has adjusted it, see applySpeedReductions
const isSpeedReduction = (value: any): boolean => value === 'half' || value === 'reduced';

const isReservedNonNumericValue = (value: any): boolean =>
  value === 'auto-fail' || isSpeedReduction(value) || typeof value === 'boolean';

// Spell casting adjustments merge by caster origin and spell level. This lets
// class levels establish a caster while feats, conditions and other features
// add slots or spells without replacing the rest of its spellbook.
const mergeSpellLevel = (target: SpellLevel, incoming: Partial<SpellLevel>): void => {
  if (incoming.perDay) {
    target.perDay.total += Number(incoming.perDay.total) || 0;
    target.perDay.current += Number(incoming.perDay.current) || 0;
    if (incoming.perDay.label) target.perDay.label = incoming.perDay.label;
  }
  if (Array.isArray(incoming.prepared)) target.prepared = [...(target.prepared || []), ...clone(incoming.prepared)];
  for (const counter of ['used', 'extraUsed'] as const) {
    if (incoming[counter]) target[counter] = (Number(target[counter]) || 0) + (Number(incoming[counter]) || 0);
  }

  for (const incomingSpell of incoming.spells ?? []) {
    const spell = clone(incomingSpell);
    const existing = target.spells.find(({name}) => name.toLowerCase() === spell.name.toLowerCase());
    if (existing) {
      const adjustments = existing.adjustments || spell.adjustments
        ? {...existing.adjustments, ...spell.adjustments}
        : undefined;
      Object.assign(existing, spell, {adjustments});
    } else {
      target.spells.push(spell);
    }
  }
};

const mergeSpellLevels = (target: SpellLevel[], incoming: Partial<SpellLevel>[]): void => {
  incoming.forEach((spellLevel, index) => {
    if (!spellLevel) return;
    if (!target[index]) target[index] = emptySpellLevel();
    mergeSpellLevel(target[index], spellLevel);
  });
};

const CASTER_META_KEYS = [
  'casting', 'arcane', 'classTable', 'classLevel', 'domainSlots', 'specialistSchool', 'ignoreArmorSpellFailure',
  'domains', 'school', 'oppositionSchools',
] as const;

const mergeCaster = (target: CasterType, incoming: Partial<CasterType>): void => {
  if (incoming.name && !target.name) target.name = incoming.name;
  if (incoming.ability && !target.ability) target.ability = incoming.ability;
  target.casterLevel += Number(incoming.casterLevel) || 0;
  target.concentration += Number(incoming.concentration) || 0;
  if (incoming.dcBonus) target.dcBonus = (Number(target.dcBonus) || 0) + (Number(incoming.dcBonus) || 0);
  // what makes a class caster (see rules/spellcasting.ts) and the choices of a caster, the first one given wins
  for (const key of CASTER_META_KEYS) {
    if (incoming[key] !== undefined && target[key] === undefined) (target as any)[key] = clone(incoming[key]);
  }
  mergeSpellLevels(target.spells, incoming.spells ?? []);
};

const mergeSpellCasting = (target: SpellCasting, incoming: SpellCasting): void => {
  for (const [origin, caster] of Object.entries(incoming)) {
    if (!target[origin]) target[origin] = emptyCaster();
    mergeCaster(target[origin], caster);
  }
};

// an adjustment can be worth anything (a whole attack for example), only numbers and calculated strings total up
const isBonus = (value: any, char: Character): boolean => {
  if (value === 'auto-fail' || isSpeedReduction(value)) return false;
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  try { return evaluateVal(value, char) > 0; } catch { return false; }
};

// touch and flat-footed ac are built from the ac adjustments, each of them ignoring some of those
// everything else that adjusts ac (size, deflection, untyped adjustments, ...) adjusts them just the same
export const derivedAcStats: {stat: string, ignores: (type: string, value: any, char: Character) => boolean}[] = [
  // a touch attack goes around armor, shields and the thick hide of a creature
  {stat: 'touchAc', ignores: (type) => touchAcIgnoredBonusTypes.includes(type)},
  // a flat-footed character cannot move out of the way, it loses its dodge bonuses and its dex bonus
  {
    stat: 'flatFootedAc',
    ignores: (type, value, char) =>
      flatFootedAcIgnoredBonusTypes.includes(type) || (dexBonusTypes.includes(type) && isBonus(value, char)),
  },
];

@Injectable({
  providedIn: 'root'
})
export class ApplyCharacterService {

  private conditionsService = inject(ConditionsService);
  // the d% of spell failure, see PERCENTILE_ROLL
  private percentileRoll = inject(PERCENTILE_ROLL);

  public featureListLocations = [...FEATURE_LIST_LOCATIONS];

  // the rules of the game worked out from the character's data, see RuleModule. tests can swap them out
  public ruleModules: RuleModule[] = RULE_MODULES;

  public adjustmentsMap: {[key: string]: AdjustmentMapArray} = {};
  private postAdjustments: AdjustmentMapEntry[] = [];
  private skillSelectorAdjustments: DeferredSkillSelectorAdjustment[] = [];
  private suppressedConditionIndices: Set<number> = new Set();
  // the names of the conditions applied to the character (lower case), so the rules can tell what a condition did
  private appliedConditionNames: Set<string> = new Set();
  private appliedRuleConditions: Feature[] = [];
  private suppressedRuleConditionIndices: Set<number> = new Set();
  private activeFeatureNames: Set<string> = new Set();
  private entryOrder = new WeakMap<AdjustmentMapEntry, number>();
  private nextEntrySeq = 0;
  private rawOpenSubSkills: { [family: string]: SkillObj } = {};
  private classSkillEntries: Set<string> = new Set();
  // the applied character before any adjustment, what a set adjustment replaces
  private baseChar: Character = new Character();
  // the attacks of the applied character before the adjustments of every attack (melee.*, ranged.*)
  private attackBase: Pick<Character, 'melee' | 'ranged'> = {melee: [], ranged: []};
  // the set adjustment currently in effect per path, a later one replaces it
  private setValues = new Map<string, {entry: AdjustmentMapEntry, value: number}>();
  // set adjustments, in the order they came in, they replace a base value once everything that adds to it is in
  private setEntries: AdjustmentMapEntry[] = [];
  // min and max adjustments, they bound a value after everything that adds to it
  private boundEntries: AdjustmentMapEntry[] = [];

  public raw: WritableSignal<Character> = signal(new Character());

  // the conditions the rules put the character under (see RuleModule). a condition with a template keeps the
  // template's description and adjustments, reason says why the rule gave it and source where it comes from
  // ("from hit points", ...)
  public ruleConditions(): Feature[] {
    this.applied();
    return this.appliedRuleConditions;
  }

  // whether the rule condition at that index of ruleConditions() is suppressed (a more severe one in its group, a
  // duplicate of a condition the character is already under, ...), like isConditionSuppressed for the raw ones
  public isRuleConditionSuppressed(index: number): boolean {
    this.applied();
    return this.suppressedRuleConditionIndices.has(index);
  }

  public isConditionSuppressed(index: number): boolean {
    this.applied();
    return this.suppressedConditionIndices.has(index);
  }

  public applied: Signal<Character> = computed(() => {
    const character = this.raw();
    const applied = this.applyCharacter(character, []);
    // the conditions that follow from the final values of the character (dying below 0 hp, ...) change values worked
    // out long before them (a helpless character's dex, and everything that takes its modifier), so with any of them
    // the character is worked out once more, under those conditions from the start. the rules giving them must not
    // read anything those conditions change, so there is no need to go around again, see RuleModule.finalConditions
    const finalConditions = this.runRuleHook('finalConditions', character, applied);
    return finalConditions.length ? this.applyCharacter(character, finalConditions) : applied;
  });

  // works the applied character out from the raw one, finalConditions are put on it along with the other conditions
  private applyCharacter(character: Character, finalConditions: Feature[]): Character {
    this.adjustmentsMap = {};
    this.postAdjustments = [];
    this.skillSelectorAdjustments = [];
    this.suppressedConditionIndices = new Set();
    this.suppressedRuleConditionIndices = new Set();
    this.appliedConditionNames = new Set();
    this.activeFeatureNames = new Set();
    this.entryOrder = new WeakMap();
    this.nextEntrySeq = 0;
    this.rawOpenSubSkills = {};
    this.classSkillEntries = new Set();
    this.setValues = new Map();
    this.setEntries = [];
    this.boundEntries = [];

    const appliedChar = JSON.parse(JSON.stringify(character)) as Character;
    this.ensureCharacterDefaults(appliedChar, character);
    this.baseChar = clone(appliedChar);
    // until the adjustments of every attack, the attacks are those the character started out with
    this.attackBase = {melee: this.baseChar.melee || [], ranged: this.baseChar.ranged || []};

    for (const classLevel of character.classLevels || []) {
      for (const skillName of classLevel.classSkills || []) {
        this.classSkillEntries.add(skillName.trim().toLowerCase());
      }
    }
    this.applyInitialClassSkills(appliedChar);

    const { effectiveConditions, suppressedIndices, suppressedRuleIndices, activeNames } =
      this.resolveFeaturesAndConditions(appliedChar, finalConditions);
    this.suppressedConditionIndices = suppressedIndices;
    this.suppressedRuleConditionIndices = suppressedRuleIndices;
    for (const condition of effectiveConditions) this.appliedConditionNames.add(conditionKey(condition));
    this.activeFeatureNames = activeNames;

    // the rules that follow from the raw data alone come before any other feature
    this.applyFeatureList(appliedChar, this.runRuleHook('base', character, appliedChar));

    // apply class features, the hit points of every level are given by the class progression rule
    for (const classLevel of character.classLevels || []) {
      this.applyFeatureList(appliedChar, classLevel.features || []);
    }

    const initialRawConditionsCount = (appliedChar.conditions || []).length;

    // apply features from feature Lists
    for (const location of this.featureListLocations) {
      if (location === 'conditions') {
        // Any conditions dynamically pushed onto appliedChar.conditions by classLevels or race.features
        // were already accounted for in resolveFeaturesAndConditions, so apply effectiveConditions.
        this.applyFeatureList(appliedChar, effectiveConditions);
      } else {
        this.applyFeatureList(appliedChar, getByPath(appliedChar, location) || []);
      }
    }

    // apply features from inventory
    this.applyFeatureList(appliedChar, (appliedChar.inventory || []).reduce((cur, item): Feature[] => {
      // the attacks an item gives know the item, for its proficiency, ammunition, ... (see rules/attacks.ts)
      if (item.equipped) return [...cur, ...namedAfterItem(item, tagItemAttacks(item))];
      else return cur;
    }, [] as Feature[]));

    // If any features after 'conditions' pushed new conditions onto appliedChar.conditions, apply non-duplicate ones
    if ((appliedChar.conditions || []).length > initialRawConditionsCount) {
      const lateConditions = appliedChar.conditions.slice(initialRawConditionsCount);
      this.applyLateConditions(appliedChar, lateConditions);
    }

    // assign mod dependant things after features have been processed
    this.attackBase = clone({melee: appliedChar.melee || [], ranged: appliedChar.ranged || []});
    for (const entry of this.postAdjustments) this.assignToChar(appliedChar, entry);

    // Expand and apply selector adjustments under skills.* after all non-selector adjustments
    this.applyDeferredSkillSelectors(appliedChar);

    // Sets, then caps and floors, once everything that adds to a value has been applied
    // what the character carries (and the armor it wears) is worked out in there, once its strength and size are final
    this.finalizeAdjustments(appliedChar);

    // the rules that take the final values of the character (its size, bab, ...)
    this.applyLateFeatures(appliedChar, this.runRuleHook('final', character, appliedChar));

    // Apply half and reduced speeds after everything else that adjusts speed
    this.applySpeedReductions(appliedChar);

    for (const module of this.ruleModules) {
      if (!module.finalize) continue;
      try { module.finalize(character, appliedChar, this.ruleContext()); }
      catch (e) { console.error(`rule module ${module.name} (finalize)`, e); }
    }

    // Settle overwritten flags on variant entries
    this.settleAllVariantOverwrittenFlags(appliedChar);

    return appliedChar;
  }

  public saveOnUpdate: boolean = false;

  // the undo history of the raw character, see utils/character-history.ts. every change goes through update()
  public readonly history = new CharacterHistory();
  // the action under way (labelled), its changes are one step of the history
  private action?: {label: string, recorded: boolean};

  constructor() {
    effect(() => {
      if (!this.saveOnUpdate) return;
      const rawChar = this.raw();
      ls.setItem('character-'+rawChar.id, rawChar);
    });
  }

  private ensureCharacterDefaults(appliedChar: Character, rawChar: Character): void {
    appliedChar.attackRollBonus ??= 0;
    appliedChar.meleeAttackRollBonus ??= 0;
    appliedChar.rangedAttackRollBonus ??= 0;
    appliedChar.savingThrowBonus ??= 0;
    appliedChar.skillCheckBonus ??= 0;
    appliedChar.abilityCheckBonus ??= 0;
    appliedChar.armorCheckPenalty ??= 0;
    appliedChar.arcaneSpellFailureChance ??= 0;
    appliedChar.spellFailureChance ??= 0;
    appliedChar.spellSchoolDcBonus = {...(appliedChar.spellSchoolDcBonus || {})};
    appliedChar.experience ??= 0;
    appliedChar.advancementTrack ??= 'medium';
    appliedChar.favoredClasses ??= [];
    appliedChar.bonusFeats ??= 0;
    appliedChar.bonusSkillRanks ??= 0;
    appliedChar.proficiencies = {
      weapons: [...(appliedChar.proficiencies?.weapons || [])],
      armor: [...(appliedChar.proficiencies?.armor || [])],
    };
    appliedChar.deity ??= '';
    appliedChar.traits ??= [];
    appliedChar.drawbacks ??= [];
    appliedChar.bonusTraits ??= 0;
    appliedChar.abilityDamage ??= {};
    appliedChar.abilityDrain ??= {};
    appliedChar.nonlethalDamage ??= 0;
    appliedChar.stable ??= false;
    appliedChar.damageReduction = damageReductionMap(appliedChar.damageReduction);
    appliedChar.energyResistance ??= {};
    appliedChar.spellResistance ??= 0;
    appliedChar.immunities ??= [];
    appliedChar.concealment ??= 0;
    appliedChar.combatOptions = {...defaultCombatOptions(), ...(appliedChar.combatOptions || {})};
    appliedChar.availableCombatOptions = {...(appliedChar.availableCombatOptions || {})};
    appliedChar.twoWeaponFighting = {...defaultTwoWeaponFighting(), ...(appliedChar.twoWeaponFighting || {})};
    appliedChar.denyDexBonus = {
      ac: Boolean(appliedChar.denyDexBonus?.ac),
      cmd: Boolean(appliedChar.denyDexBonus?.cmd),
    };
    appliedChar.speed = {
      land: 0,
      swim: 0,
      fly: 0,
      ...(appliedChar.speed || {}),
    };

    if (!appliedChar.skills) appliedChar.skills = {};

    // Fixed family: knowledge always has exactly the 10 knowledge specialties
    const rawKnowledgeSubs = rawChar.skills?.['knowledge']?.subSkills || {};
    const knowledgeSubs: SkillObj = {};
    for (const spec of KNOWLEDGE_SPECIALTIES) {
      const existing = rawKnowledgeSubs[spec];
      knowledgeSubs[spec] = {
        name: spec,
        ranks: Number(existing?.ranks) || 0,
        value: Number(existing?.value) || 0,
        classSkill: false,
        baseAbility: 'int',
      };
    }
    appliedChar.skills['knowledge'] = {
      name: 'knowledge',
      ranks: 0,
      value: 0,
      classSkill: false,
      baseAbility: 'int',
      subSkills: knowledgeSubs,
    };

    // Open families: craft, perform, profession start with no specialties on appliedChar;
    // specialties are only added via active adjustments, pulling saved ranks from rawChar.
    for (const family of OPEN_SKILL_FAMILIES) {
      const rawSubs = rawChar.skills?.[family]?.subSkills || {};
      const normalizedRawSubs: SkillObj = {};
      for (const [k, v] of Object.entries(rawSubs)) {
        normalizedRawSubs[k.toLowerCase()] = clone(v);
      }
      this.rawOpenSubSkills[family] = normalizedRawSubs;

      const baseAbility = rawChar.skills?.[family]?.baseAbility || skillAbilityMap[family];
      appliedChar.skills[family] = {
        name: family,
        ranks: 0,
        value: 0,
        classSkill: false,
        baseAbility,
        subSkills: {},
      };
    }
  }

  private applyClassSkillFlag(skillKey: string, skill: Skill, subKey?: string): void {
    if (subKey !== undefined) {
      const fam = skillKey.toLowerCase();
      const sub = subKey.toLowerCase();
      if (this.classSkillEntries.has(fam) || this.classSkillEntries.has(`${fam} (${sub})`)) {
        skill.classSkill = true;
      }
    } else if (!isSkillFamily(skillKey)) {
      if (this.classSkillEntries.has(skillKey.toLowerCase())) {
        skill.classSkill = true;
      }
    }
  }

  private applyInitialClassSkills(char: Character): void {
    for (const [key, skill] of Object.entries(char.skills || {})) {
      if (isSkillFamily(key)) {
        for (const [subKey, subSkill] of Object.entries(skill.subSkills || {})) {
          this.applyClassSkillFlag(key, subSkill, subKey);
        }
      } else {
        this.applyClassSkillFlag(key, skill);
      }
    }
  }

  private findConditionTemplate(lowerName: string): Feature | undefined {
    return this.conditionsService.list.find(
      c => (c.name || c.id || '').trim().toLowerCase() === lowerName
    );
  }

  // extraConditions are the conditions granted by rules and features, suppressedExtraIndices are indices into it
  private resolveConditionsList(rawConditions: Feature[], extraConditions: Feature[]): {
    effectiveConditions: Feature[];
    suppressedIndices: Set<number>;
    suppressedExtraIndices: Set<number>;
  } {
    const candidates: ConditionCandidate[] = [];
    rawConditions.forEach((cond, idx) => {
      if (cond && cond.active !== false) {
        candidates.push({ feature: clone(cond), rawIndex: idx });
      }
    });
    const extraCandidates = new Map<ConditionCandidate, number>();
    extraConditions.forEach((cond, idx) => {
      if (cond && cond.active !== false) {
        const candidate: ConditionCandidate = { feature: clone(cond), rawIndex: -1 };
        candidates.push(candidate);
        extraCandidates.set(candidate, idx);
      }
    });

    // Expand transitive included conditions
    const syntheticByName = new Map<string, ConditionCandidate>();
    const expandInclusions = (source: ConditionCandidate, condName: string, visited = new Set<string>()) => {
      const includedNames = CONDITION_INCLUSIONS[condName] || [];
      for (const incName of includedNames) {
        if (visited.has(incName)) continue;
        visited.add(incName);
        let syn = syntheticByName.get(incName);
        if (!syn) {
          const tpl = this.findConditionTemplate(incName);
          const synFeature = tpl ? clone(tpl) : new Feature({ id: incName, name: incName, adjustments: {}, active: true });
          syn = { feature: synFeature, rawIndex: -1, includedBy: new Set([source]) };
          syntheticByName.set(incName, syn);
        } else {
          syn.includedBy!.add(source);
        }
        expandInclusions(source, incName, visited);
      }
    };

    for (const cand of candidates) {
      const cName = (cand.feature.name || '').trim().toLowerCase();
      if (cName) expandInclusions(cand, cName);
    }

    const allCandidates: ConditionCandidate[] = [...candidates, ...syntheticByName.values()];

    // Apply severity groups: only the most severe active condition in each group applies
    for (const group of CONDITION_SEVERITY_GROUPS) {
      let maxSeverity = -1;
      for (const cand of allCandidates) {
        if (cand.suppressed) continue;
        const cName = (cand.feature.name || '').trim().toLowerCase();
        const sevIdx = group.indexOf(cName);
        if (sevIdx > maxSeverity) maxSeverity = sevIdx;
      }
      if (maxSeverity > 0) {
        for (const cand of allCandidates) {
          const cName = (cand.feature.name || '').trim().toLowerCase();
          const sevIdx = group.indexOf(cName);
          if (sevIdx !== -1 && sevIdx < maxSeverity) {
            cand.suppressed = true;
          }
        }
      }
    }

    // Suppress any synthetic condition whose including parents were all suppressed
    for (const syn of syntheticByName.values()) {
      if (syn.includedBy && Array.from(syn.includedBy).every(parent => parent.suppressed)) {
        syn.suppressed = true;
      }
    }

    // Deduplicate identical condition names (except Energy Drained)
    const seenNames = new Set<string>();
    for (const cand of allCandidates) {
      if (cand.suppressed) continue;
      const cName = (cand.feature.name || '').trim().toLowerCase();
      if (cName && cName !== 'energy drained') {
        if (seenNames.has(cName)) {
          cand.suppressed = true;
        } else {
          seenNames.add(cName);
        }
      }
    }

    const suppressedIndices = new Set<number>();
    for (const cand of candidates) {
      if (cand.suppressed && cand.rawIndex >= 0) {
        suppressedIndices.add(cand.rawIndex);
      }
    }

    const suppressedExtraIndices = new Set<number>();
    for (const [cand, idx] of extraCandidates) {
      if (cand.suppressed) suppressedExtraIndices.add(idx);
    }

    const effectiveConditions = allCandidates
      .filter(cand => !cand.suppressed)
      .map(cand => cand.feature);

    return { effectiveConditions, suppressedIndices, suppressedExtraIndices };
  }

  private resolveFeaturesAndConditions(char: Character, finalConditions: Feature[]): {
    effectiveConditions: Feature[];
    suppressedIndices: Set<number>;
    suppressedRuleIndices: Set<number>;
    activeNames: Set<string>;
  } {
    let activeNames = new Set<string>();
    let effectiveConditions: Feature[] = [];
    let suppressedIndices = new Set<number>();
    let suppressedRuleIndices = new Set<number>();
    // the conditions the rules put the character under, a condition given by name only takes its template, its
    // description and adjustments, the description the rule gave is the reason it gave the condition
    const ruleConditions = [...this.runRuleHook('conditions', char), ...finalConditions].map(condition => {
      const template = condition.adjustments && Object.keys(condition.adjustments).length
        ? undefined
        : this.findConditionTemplate((condition.name || '').trim().toLowerCase());
      return template
        ? new Feature({
            ...clone(template),
            ...condition,
            description: template.description,
            reason: condition.reason ?? condition.description,
            adjustments: clone(template.adjustments),
          })
        : new Feature({...condition, reason: condition.reason ?? condition.description});
    });
    this.appliedRuleConditions = ruleConditions;

    const collectNestedFeatures = (
      features: Feature[],
      currentActiveNames: Set<string>,
      outNames: Set<string>,
      outGrantedConditions: Feature[],
      isConditionList = false,
    ) => {
      for (const f of features) {
        if (!f || f.active === false) continue;
        const fname = (f.name || '').trim().toLowerCase();
        if (fname) outNames.add(fname);
        if (f.adjustments && typeof f.adjustments === 'object') {
          for (const [k, rawAdj] of Object.entries(f.adjustments)) {
            const strippedKey = k.replace(/\[[^\]]*\]$/, '');
            if (!FEATURE_CONTAINER_KEYS.has(strippedKey)) continue;
            if (!checkConditionals(rawAdj, currentActiveNames)) continue;
            const val = isAdjustmentWrapperObject(rawAdj) ? rawAdj.value : rawAdj;
            const grantedList = (Array.isArray(val) ? val : [val]).filter(
              (item): item is Feature => !!item && typeof item === 'object'
            );
            if (strippedKey === 'conditions' && !isConditionList) {
              outGrantedConditions.push(...grantedList);
            } else {
              collectNestedFeatures(grantedList, currentActiveNames, outNames, outGrantedConditions, false);
            }
          }
        }
      }
    };

    for (let pass = 0; pass < 5; pass++) {
      const nonConditionRoots: Feature[] = [
        ...(char.classLevels || []).flatMap(cl => cl.features || []),
        ...(char.race?.features || []),
        ...(char.feats || []),
        ...(char.specialAttack || []),
        ...(char.defensiveAbilities || []),
        ...(char.specialQuality || []),
        ...(char.traits || []),
        ...(char.drawbacks || []),
        ...(char.inventory || []).filter(item => item.equipped).flatMap(item => item.features || []),
      ];

      const nextNames = new Set<string>();
      const grantedConditions: Feature[] = [...ruleConditions];
      collectNestedFeatures(nonConditionRoots, activeNames, nextNames, grantedConditions, false);

      const resolved = this.resolveConditionsList(char.conditions || [], grantedConditions);
      effectiveConditions = resolved.effectiveConditions;
      suppressedIndices = resolved.suppressedIndices;
      // the rule conditions come first among the granted ones
      suppressedRuleIndices = new Set([...resolved.suppressedExtraIndices].filter(idx => idx < ruleConditions.length));

      const extraGrantedFromConditions: Feature[] = [];
      collectNestedFeatures(effectiveConditions, activeNames, nextNames, extraGrantedFromConditions, true);

      if (
        pass > 0 &&
        nextNames.size === activeNames.size &&
        Array.from(nextNames).every(n => activeNames.has(n))
      ) {
        activeNames = nextNames;
        break;
      }
      activeNames = nextNames;
    }

    return { effectiveConditions, suppressedIndices, suppressedRuleIndices, activeNames };
  }

  private applyLateConditions(char: Character, lateConditions: Feature[]): void {
    // Only needed if a feat/item dynamically pushed a condition that wasn't already in effectiveConditions
    for (const cond of lateConditions) {
      if (!cond || cond.active === false) continue;
      const cName = (cond.name || '').trim().toLowerCase();
      if (cName && this.activeFeatureNames.has(cName) && cName !== 'energy drained') continue;
      this.appliedConditionNames.add(cName);
      this.applyFeatureList(char, [cond]);
    }
  }

  initializeCharacter(character: Character, saveOnUpdate: boolean = false) {
    // Characters saved before origin-based casting used arrays for these fields.
    // There was no spell data in that shape, so migrate it to an empty map.
    if (Array.isArray(character.spells) || !character.spells) character.spells = {};
    if (Array.isArray(character.spellLikeAbilities) || !character.spellLikeAbilities) character.spellLikeAbilities = {};
    // and damage reduction as a list of {value, bypass}, it is now keyed by bypass, see rules/defenses.ts
    migrateDamageReduction(character);
    this.saveOnUpdate = saveOnUpdate;
    this.lastRest.set(undefined);
    this.raw.set(character);
    this.history.reset(character);
  }

  assignToChar(char: Character, adjustmentMapEntry: AdjustmentMapEntry) {
    if (adjustmentMapEntry.variant !== undefined) return;
    if (adjustmentMapEntry.value === 'auto-fail') return;
    if (isSpeedReduction(adjustmentMapEntry.value) && adjustmentMapEntry.adjusting.startsWith('speed.')) return;
    const spellCastingNumber = !!adjustmentMapEntry.mode && this.prepareSpellCastingNumber(char, adjustmentMapEntry);
    if (!spellCastingNumber && this.assignSpellCastingAdjustment(char, adjustmentMapEntry)) return;
    if (adjustmentMapEntry.mode === 'set') {
      // sets wait until everything adding to the value has been applied, see finalizeAdjustments
      this.setEntries.push(adjustmentMapEntry);
      return;
    }
    if (adjustmentMapEntry.mode === 'min' || adjustmentMapEntry.mode === 'max') {
      // bounds wait until everything else adjusting the value has been applied, see applyBounds
      this.boundEntries.push(adjustmentMapEntry);
      return;
    }
    // bonuses that stack with each other (untyped, dodge, ...) have no key, see bonusStackingKey
    const typeKey = bonusStackingKey(adjustmentMapEntry.type, adjustmentMapEntry.origin);
    if (typeKey && !['ranged', 'melee'].includes(adjustmentMapEntry.adjusting)) {
      const mapArr = this.adjustmentsMap[adjustmentMapEntry.adjusting];
      const appliedTypeBonus = mapArr[typeKey];
      if (appliedTypeBonus) {
        // same-type bonuses don't stack: only the larger applies, the other is crossed out
        if (evaluateVal(adjustmentMapEntry.value, char) < evaluateVal(appliedTypeBonus.value, char)) {
          adjustmentMapEntry.overwritten = true;
          return;
        }
        // the new bonus wins: undo the smaller one already added to the stat and cross it out
        appliedTypeBonus.overwritten = true;
        assignByPath(char, appliedTypeBonus.adjusting, -evaluateVal(appliedTypeBonus.value, char));
      }
      Object.defineProperty(mapArr, typeKey, {
        value: adjustmentMapEntry,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    assignByPath(char, adjustmentMapEntry.adjusting, adjustmentMapEntry.value);
  }

  // the concrete paths a path with * in it stands for: melee.*.toHitBonus is the toHitBonus of every melee attack
  private concretePaths(char: Character, path: string): string[] {
    const segments = path.split('.');
    const star = segments.indexOf('*');
    if (star === -1) return [path];
    const prefix = segments.slice(0, star).join('.');
    const target = prefix ? getByPath(char, prefix) : char;
    if (!target || typeof target !== 'object') return [];
    const rest = segments.slice(star + 1).join('.');
    return Object.keys(target).flatMap(key =>
      this.concretePaths(char, [prefix, key, rest].filter(Boolean).join('.'))
    );
  }

  // the value of a stat before anything adjusted it, what a set adjustment replaces
  // adjustments of every attack (melee.*, ranged.*) wait until all attacks exist, see trackAdjustment, so for
  // an attack that is the attack as it was given to the character
  private baseValue(path: string): number {
    const base = /^(melee|ranged)\./.test(path) ? this.attackBase : this.baseChar;
    return Number(getByPath(base, path)) || 0;
  }

  // a set adjustment replaces the base value of a stat, whatever added to it keeps adding on top of it
  // no matter whether it was applied before or after the set. a later set replaces an earlier one
  // resolves the adjustments that do not add: the sets, in the order they came in, and then the caps and floors
  // until then a stat holds its base value and whatever has been added to it, formulas and skill selectors included
  // what the character carries can slow it down and limit it, which takes its final strength and size: so the load
  // is worked out after the sets and the bounds, except for the bounds on the values a load caps itself (its max dex
  // bonus and armor check penalty), those are resolved together with the caps of the load, see applyLoadCondition
  private finalizeAdjustments(char: Character): void {
    for (const entry of this.setEntries) this.assignSet(char, entry);
    const loadBoundPaths = this.loadBoundPaths();
    this.applyBounds(char, path => !loadBoundPaths.has(path));

    this.applyArmorSpeed(char);
    this.applyEncumbrance(char);

    this.applyBounds(char, path => loadBoundPaths.has(path));
  }

  // what the rule hooks are given about the adjustments applied so far
  private ruleContext(): RuleContext {
    return {adjustmentsMap: this.adjustmentsMap, conditionNames: this.appliedConditionNames};
  }

  // the features a rule hook gives back, a module that throws is skipped so one broken rule does not break the sheet
  private runRuleHook(hook: 'conditions', raw: Character): Feature[];
  private runRuleHook(hook: 'base' | 'final' | 'finalConditions', raw: Character, applied: Character): Feature[];
  private runRuleHook(
    hook: 'conditions' | 'base' | 'final' | 'finalConditions', raw: Character, applied?: Character,
  ): Feature[] {
    const features: Feature[] = [];
    for (const module of this.ruleModules) {
      const run = module[hook];
      if (!run) continue;
      try {
        const given = run.call(module, raw, applied as Character, this.ruleContext()) || [];
        // a condition says where it comes from, the module unless the rule said otherwise
        const isConditionHook = hook === 'conditions' || hook === 'finalConditions';
        features.push(...(isConditionHook
          ? given.map(condition => new Feature({...condition, source: condition.source || `from ${module.name}`}))
          : given));
      } catch (e) {
        console.error(`rule module ${module.name} (${hook})`, e);
      }
    }
    return features;
  }

  // applies features once the sets and bounds have been resolved (the final rules): whatever they add, set, cap,
  // floor or work out with a formula is resolved right away, in the same order as for every other feature
  private applyLateFeatures(char: Character, features: Feature[]): void {
    if (!features.length) return;
    const firstPost = this.postAdjustments.length;
    const firstSelector = this.skillSelectorAdjustments.length;
    const firstSet = this.setEntries.length;
    const firstBound = this.boundEntries.length;
    this.applyFeatureList(char, features);
    for (const entry of this.postAdjustments.slice(firstPost)) this.assignToChar(char, entry);
    this.applyDeferredSkillSelectors(char, this.skillSelectorAdjustments.slice(firstSelector));
    for (const entry of this.setEntries.slice(firstSet)) this.assignSet(char, entry);
    this.applyBounds(char, () => true, this.boundEntries.slice(firstBound));
  }

  private assignSet(char: Character, entry: AdjustmentMapEntry): void {
    const numeric = typeof entry.value === 'number' || isCalculatedString(entry.value);
    const value = numeric ? evaluateVal(entry.value, char) : NaN;

    for (const path of this.concretePaths(char, entry.adjusting)) {
      const previous = this.setValues.get(path);
      if (previous) previous.entry.overwritten = true;

      if (!numeric) {
        // anything that is not a number (a name, a list of languages, ...) is simply replaced
        setByPath(char, path, clone(entry.value));
      } else {
        const current = Number(getByPath(char, path)) || 0;
        const base = previous && !Number.isNaN(previous.value) ? previous.value : this.baseValue(path);
        // current - base is whatever has been added to the stat so far
        setByPath(char, path, value + (current - base));
      }
      this.setValues.set(path, {entry, value});
    }
  }

  // min adjustments cap a value, the lowest cap wins. max adjustments floor it, the highest floor wins
  // a value nothing else adjusted (undefined) simply takes the bound. when a floor is above a cap the floor wins
  // a bound that does not change the value is marked overwritten, so the tooltip shows it did not matter
  // a bound of every attack (melee.*.toHitBonus) bounds each attack on its own
  // only the paths include accepts are bounded, so the bounds can be resolved in steps
  private applyBounds(
    char: Character,
    include: (path: string) => boolean = () => true,
    entries: AdjustmentMapEntry[] = this.boundEntries,
  ): void {
    const byPath = new Map<string, {entry: AdjustmentMapEntry, value: number}[]>();
    for (const entry of entries) {
      const paths = this.concretePaths(char, entry.adjusting).filter(include);
      if (!paths.length) continue;
      entry.overwritten = true;
      const value = evaluateVal(entry.value, char);
      for (const path of paths) {
        if (!byPath.has(path)) byPath.set(path, []);
        byPath.get(path)!.push({entry, value});
      }
    }

    for (const [path, valued] of byPath.entries()) {
      const raw = getByPath(char, path);
      let current: number | undefined = raw === undefined || raw === null ? undefined : Number(raw) || 0;

      for (const [mode, pick, binds] of [
        ['min', Math.min, (cur: number, bound: number) => cur > bound],
        ['max', Math.max, (cur: number, bound: number) => cur < bound],
      ] as const) {
        const bounds = valued.filter(({entry}) => entry.mode === mode);
        if (!bounds.length) continue;
        const boundValue = pick(...bounds.map(({value}) => value));
        if (current === undefined || binds(current, boundValue)) {
          current = boundValue;
          bounds.find(({value}) => value === boundValue)!.entry.overwritten = false;
        }
      }

      setByPath(char, path, current);
    }
  }

  // set, min and max work on the numbers of a caster: its caster level, concentration and uses per day
  // anything else of a caster (its name, its spells, a whole caster) is merged, whatever its mode
  private prepareSpellCastingNumber(char: Character, entry: AdjustmentMapEntry): boolean {
    const match = /^(spells|spellLikeAbilities)\.([^.*]+)\.(casterLevel|concentration|dcBonus|spells\.(\d+)\.perDay\.(total|current))$/
      .exec(entry.adjusting);
    if (!match) return false;
    const type = match[1] as SpellCastingType;
    if (!char[type][match[2]]) char[type][match[2]] = emptyCaster();
    const caster = char[type][match[2]];
    if (match[4] !== undefined) {
      const level = Number(match[4]);
      while (caster.spells.length <= level) caster.spells.push(emptySpellLevel());
      if (!caster.spells[level]) caster.spells[level] = emptySpellLevel();
    }
    return true;
  }

  private assignSpellCastingAdjustment(char: Character, entry: AdjustmentMapEntry): boolean {
    const match = /^(spells|spellLikeAbilities)(?:\.([^.]+))?(?:\.(.+))?$/.exec(entry.adjusting);
    if (!match) return false;

    const type = match[1] as SpellCastingType;
    const origin = match[2];
    const rest = match[3];
    if (!origin) {
      mergeSpellCasting(char[type], clone(entry.value));
      return true;
    }

    if (!char[type][origin]) char[type][origin] = emptyCaster();
    const caster = char[type][origin];
    if (!rest) {
      mergeCaster(caster, clone(entry.value));
      return true;
    }

    if (rest === 'casterLevel' || rest === 'concentration') {
      caster[rest] += Number(entry.value) || 0;
      return true;
    }
    if (rest === 'dcBonus') {
      caster.dcBonus = (Number(caster.dcBonus) || 0) + (Number(entry.value) || 0);
      return true;
    }
    if (rest === 'name' || rest === 'ability' || rest === 'school') {
      caster[rest] = entry.value;
      return true;
    }
    if (rest === 'domains' || rest === 'oppositionSchools') {
      caster[rest] = [...(caster[rest] || []), ...(Array.isArray(entry.value) ? entry.value : [entry.value])];
      return true;
    }
    if (rest === 'spells') {
      mergeSpellLevels(caster.spells, clone(Array.isArray(entry.value) ? entry.value : [entry.value]));
      return true;
    }

    const levelMatch = /^spells\.(\d+)(?:\.(perDay(?:\.(?:current|total|label))?|spells))?$/.exec(rest);
    if (!levelMatch) return false;
    const levelIndex = Number(levelMatch[1]);
    const field = levelMatch[2];
    if (!caster.spells[levelIndex]) caster.spells[levelIndex] = emptySpellLevel();
    const spellLevel = caster.spells[levelIndex];
    if (!field) mergeSpellLevel(spellLevel, clone(entry.value));
    else if (field === 'spells') {
      mergeSpellLevel(spellLevel, {spells: clone(Array.isArray(entry.value) ? entry.value : [entry.value])});
    } else if (field === 'perDay') {
      mergeSpellLevel(spellLevel, {perDay: clone(entry.value)});
    } else {
      const chargeField = field.replace('perDay.', '') as 'current'|'total'|'label';
      if (chargeField === 'label') spellLevel.perDay.label = entry.value;
      else spellLevel.perDay[chargeField] += Number(entry.value) || 0;
    }
    return true;
  }

  // an adjustment of the ac adjusts touch and flat-footed ac as well, unless they ignore it
  // each of them gets an entry of its own, so it can be overwritten by a bonus of the same type on its own
  derivedAcAdjustments(char: Character, adjustmentMapEntry: AdjustmentMapEntry): AdjustmentMapEntry[] {
    if (adjustmentMapEntry.adjusting !== 'ac') return [];
    const type = (adjustmentMapEntry.type || '').toLowerCase();
    return derivedAcStats
      .filter(({ignores}) => !ignores(type, adjustmentMapEntry.value, char))
      .map(({stat}) => ({...adjustmentMapEntry, adjusting: stat}));
  }

  private recordEntry(entry: AdjustmentMapEntry): void {
    const adjusting = entry.adjusting;
    if (!this.adjustmentsMap[adjusting]) this.adjustmentsMap[adjusting] = [] as unknown as AdjustmentMapArray;
    this.entryOrder.set(entry, this.nextEntrySeq++);
    this.adjustmentsMap[adjusting].push(entry);
  }

  // keeps track of what adjusts a stat, so the sheet can show where its value came from, and applies it
  // adjustments depending on ability mods (or hitting every attack) wait until everything else has been applied
  trackAdjustment(char: Character, adjustmentMapEntry: AdjustmentMapEntry) {
    this.recordEntry(adjustmentMapEntry);
    if (adjustmentMapEntry.variant !== undefined) return;
    if (adjustmentMapEntry.value === 'auto-fail') return;
    if (isSpeedReduction(adjustmentMapEntry.value) && adjustmentMapEntry.adjusting.startsWith('speed.')) return;
    const adjusting = adjustmentMapEntry.adjusting;
    if (
      (typeof adjustmentMapEntry.value === 'string' && /{(mod|stat):/.test(adjustmentMapEntry.value)) ||
      /^(melee|ranged)\.\*/.test(adjusting)
    ) {
      this.postAdjustments.push(adjustmentMapEntry);
    } else {
      this.assignToChar(char, adjustmentMapEntry);
    }
  }

  private normalizeConcreteSkillPath(char: Character, pathWithoutVariant: string): string | null {
    const subMatch = /^skills\.([^.]+)\.subSkills\.([^.]+)(?:\.(.+))?$/i.exec(pathWithoutVariant);
    if (!subMatch) return pathWithoutVariant;

    const familyKey = subMatch[1].toLowerCase();
    const subKey = subMatch[2].toLowerCase();
    const rest = subMatch[3];

    if (familyKey === 'knowledge') {
      if (!(KNOWLEDGE_SPECIALTIES as readonly string[]).includes(subKey)) {
        return null;
      }
    } else if (isOpenSkillFamily(familyKey)) {
      if (!char.skills[familyKey]) {
        char.skills[familyKey] = {
          name: familyKey,
          ranks: 0,
          value: 0,
          classSkill: false,
          baseAbility: skillAbilityMap[familyKey] || 'int',
          subSkills: {},
        };
      }
      if (!char.skills[familyKey].subSkills) char.skills[familyKey].subSkills = {};
      if (!char.skills[familyKey].subSkills![subKey]) {
        const rawSub = this.rawOpenSubSkills[familyKey]?.[subKey];
        const subSkill: Skill = {
          name: subKey,
          ranks: Number(rawSub?.ranks) || 0,
          value: Number(rawSub?.value) || 0,
          classSkill: false,
          baseAbility: char.skills[familyKey].baseAbility,
        };
        this.applyClassSkillFlag(familyKey, subSkill, subKey);
        char.skills[familyKey].subSkills![subKey] = subSkill;
      }
    } else if (!char.skills[familyKey]?.subSkills?.[subKey]) {
      return null;
    }

    return rest
      ? `skills.${familyKey}.subSkills.${subKey}.${rest}`
      : `skills.${familyKey}.subSkills.${subKey}`;
  }

  private expandObjectWildcards(obj: any, path: string): string[] {
    if (/^(melee|ranged)\.\*/.test(path)) return [path];
    const segments = path.split('.');
    const starIdx = segments.indexOf('*');
    if (starIdx === -1) return [path];

    const prefix = segments.slice(0, starIdx);
    const rest = segments.slice(starIdx + 1);
    const target = prefix.length > 0 ? getByPath(obj, prefix.join('.')) : obj;
    if (!target || typeof target !== 'object') return [];

    const results: string[] = [];
    for (const k of Object.keys(target)) {
      const nextPath = [...prefix, k, ...rest].join('.');
      results.push(...this.expandObjectWildcards(obj, nextPath));
    }
    return results;
  }

  private expandSkillSelector(char: Character, pathWithoutVariant: string): string[] {
    const allSkillsMatch = /^skills\.\*(?:\.(.+))?$/.exec(pathWithoutVariant);
    if (allSkillsMatch) {
      const rest = allSkillsMatch[1];
      const suffix = rest ? `.${rest}` : '';
      const paths: string[] = [];
      for (const [skillKey, skill] of Object.entries(char.skills || {})) {
        if (isSkillFamily(skillKey)) {
          for (const subKey of Object.keys(skill.subSkills || {})) {
            paths.push(`skills.${skillKey}.subSkills.${subKey}${suffix}`);
          }
        } else {
          paths.push(`skills.${skillKey}${suffix}`);
        }
      }
      return paths;
    }

    const abilityMatch = /^skills\.@([^.]+)(?:\.(.+))?$/i.exec(pathWithoutVariant);
    if (abilityMatch) {
      const targetAbility = abilityMatch[1].toLowerCase();
      const rest = abilityMatch[2];
      const suffix = rest ? `.${rest}` : '';
      const paths: string[] = [];
      for (const [skillKey, skill] of Object.entries(char.skills || {})) {
        if (isSkillFamily(skillKey)) {
          const famAbility = (skill.baseAbility || '').toLowerCase();
          for (const [subKey, subSkill] of Object.entries(skill.subSkills || {})) {
            if ((subSkill.baseAbility || famAbility).toLowerCase() === targetAbility) {
              paths.push(`skills.${skillKey}.subSkills.${subKey}${suffix}`);
            }
          }
        } else {
          if ((skill.baseAbility || '').toLowerCase() === targetAbility) {
            paths.push(`skills.${skillKey}${suffix}`);
          }
        }
      }
      return paths;
    }

    // @<ability> is only valid directly after skills.
    if (pathWithoutVariant.includes('@')) return [];

    const familySubMatch = /^skills\.([^.]+)\.subSkills\.\*(?:\.(.+))?$/i.exec(pathWithoutVariant);
    if (familySubMatch) {
      const familyKey = familySubMatch[1].toLowerCase();
      const rest = familySubMatch[2];
      const suffix = rest ? `.${rest}` : '';
      const subSkills = char.skills?.[familyKey]?.subSkills;
      if (!subSkills) return [];
      return Object.keys(subSkills).map(subKey => `skills.${familyKey}.subSkills.${subKey}${suffix}`);
    }

    return this.expandObjectWildcards(char, pathWithoutVariant);
  }

  private applyDeferredSkillSelectors(char: Character, selectors = this.skillSelectorAdjustments): void {
    for (const deferred of selectors) {
      const concretePaths = this.expandSkillSelector(char, deferred.pathWithoutVariant);
      for (const adjusting of concretePaths) {
        const entry: AdjustmentMapEntry = {
          adjusting,
          origin: deferred.origin,
          value: deferred.value,
          type: deferred.type,
          overwritten: false,
          ...(deferred.variant !== undefined ? { variant: deferred.variant } : {}),
          ...(deferred.mode ? { mode: deferred.mode } : {}),
        };
        this.recordEntry(entry);
        if (entry.variant === undefined && entry.value !== 'auto-fail') {
          this.assignToChar(char, entry);
        }
      }
    }
  }

  // armor that slows its wearer down lists its speeds for a base speed of 30 ft. and 20 ft., lower than those
  // it reduces the land speed, see reducedSpeed
  private applyArmorSpeed(char: Character): void {
    if (char.speedUnslowedByArmorAndLoad) return;
    for (const item of char.inventory || []) {
      const speed = (item as any).speed;
      if (!item.equipped || !Array.isArray(speed) || !speed.length) continue;
      if (Number(speed[0]) < 30 || (speed.length > 1 && Number(speed[1]) < 20)) {
        this.trackAdjustment(char, {
          adjusting: 'speed.land',
          origin: item.name,
          value: 'reduced',
          type: '',
          overwritten: false,
        });
      }
    }
  }

  // works out what the character carries and the load that makes up, and applies the condition of that load
  // everything carried counts, equipped or not, as do the coins in its purse
  private applyEncumbrance(char: Character): void {
    const itemsWeight = (char.inventory || [])
      .filter(item => item.carried !== false)
      .reduce((total, item) => total + (Number(item.weight) || 0) * (Number(item.quantity ?? 1) || 0), 0);
    // weights are entered in lbs. with a fraction at most, keep floating point noise out of the total
    char.carriedWeight = Math.round((itemsWeight + purseWeight(char.wealth)) * 100) / 100;
    char.carryingCapacity = carryingCapacity(
      (char.abilityScores?.str ?? 10) + (Number(char.carryingCapacityStrBonus) || 0),
      char.size ?? 4,
      Boolean(char.race?.quadruped),
    );
    char.load = loadFor(char.carriedWeight, char.carryingCapacity);

    const loadCondition = this.conditionsService.loadConditions[char.load];
    if (loadCondition) this.applyLoadCondition(char, loadCondition);
  }

  // the paths a load caps or floors (its max dex bonus and armor check penalty), whatever the load
  private loadBoundPaths(): Set<string> {
    const paths = new Set<string>();
    for (const condition of Object.values(this.conditionsService.loadConditions)) {
      for (const [adjusting, rawAdj] of Object.entries(condition?.adjustments || {})) {
        const mode = modeOf(rawAdj);
        if (mode === 'min' || mode === 'max') paths.add(adjusting);
      }
    }
    return paths;
  }

  // a load does not stack with armor, for its max dex bonus and armor check penalty the worse figure applies
  // so the load caps those two (min adjustments), along with any cap of the armor: the lowest cap wins, and a
  // floor above it (an ability that keeps a dex bonus) still wins over it, see applyBounds
  // everything else a load does (reducing speed) is applied like any other adjustment
  private applyLoadCondition(char: Character, condition: Feature): void {
    const origin = condition.name || '';
    const firstSet = this.setEntries.length;
    for (const [adjusting, rawAdj] of Object.entries(condition.adjustments || {})) {
      const isWrapper = isAdjustmentWrapperObject(rawAdj);
      const mode = modeOf(rawAdj);
      // a character armor and loads do not slow down keeps its speed under any load
      if (char.speedUnslowedByArmorAndLoad && adjusting.startsWith('speed.') && isSpeedReduction(isWrapper ? rawAdj.value : rawAdj)) continue;
      this.trackAdjustment(char, {
        adjusting,
        origin,
        value: isWrapper ? rawAdj.value : rawAdj,
        type: isWrapper ? (rawAdj.type || '') : '',
        overwritten: false,
        ...(mode ? {mode} : {}),
      });
    }
    // the sets have already been resolved, a set of the load is resolved right away
    for (const entry of this.setEntries.slice(firstSet)) this.assignSet(char, entry);
  }

  // half and reduced speeds apply once each, no matter how many adjustments ask for them, to the speed
  // everything else made. halving rounds down to 5 ft. and reducing follows reducedSpeed
  // when a speed is both halved and reduced, the order that leaves the character faster wins
  private applySpeedReductions(char: Character): void {
    if (!char.speed) return;
    const halve = (speed: number) => Math.floor(speed / 10) * 5;
    for (const k of Object.keys(char.speed) as (keyof typeof char.speed)[]) {
      const entries = (this.adjustmentsMap[`speed.${k}`] || []).filter(e => !e.variant);
      const halved = entries.some(e => e.value === 'half');
      const reduced = entries.some(e => e.value === 'reduced');
      const cur = Number(char.speed[k]) || 0;
      if (cur <= 0 || (!halved && !reduced)) continue;
      if (halved && reduced) {
        char.speed[k] = Math.max(halve(reducedSpeed(cur)), reducedSpeed(halve(cur)));
      } else if (halved) {
        char.speed[k] = halve(cur);
      } else {
        char.speed[k] = reducedSpeed(cur);
      }
    }
  }

  public getSkillFromStatPath(char: Character, statPath: string): Skill | undefined {
    const subMatch = /^skills\.([^.]+)\.subSkills\.([^.]+)\.value$/.exec(statPath);
    if (subMatch) {
      return char.skills?.[subMatch[1]]?.subSkills?.[subMatch[2]];
    }
    const ordMatch = /^skills\.([^.]+)\.value$/.exec(statPath);
    if (ordMatch) {
      return char.skills?.[ordMatch[1]];
    }
    return undefined;
  }

  public getInheritedBonusPaths(statPath: string, char: Character): string[] {
    if (statPath.startsWith('saves.') && statPath !== 'saves.conditional') {
      return ['savingThrowBonus'];
    }
    if (statPath.startsWith('skills.') && statPath.endsWith('.value')) {
      return ['skillCheckBonus'];
    }
    if (statPath === 'melee.*.toHitBonus') {
      return ['attackRollBonus', 'meleeAttackRollBonus'];
    }
    if (statPath === 'ranged.*.toHitBonus') {
      return ['attackRollBonus', 'rangedAttackRollBonus'];
    }
    if (statPath === 'meleeAttackRollBonus' || statPath === 'rangedAttackRollBonus') {
      return ['attackRollBonus'];
    }
    return [];
  }

  private settleAllVariantOverwrittenFlags(char: Character): void {
    const keys = Object.keys(this.adjustmentsMap);
    const depthOf = (k: string): number => this.getInheritedBonusPaths(k, char).length;
    keys.sort((a, b) => depthOf(a) - depthOf(b));

    for (const statPath of keys) {
      const ownEntries = this.adjustmentsMap[statPath] || [];
      const ownVariantEntries = ownEntries.filter(e => e.variant !== undefined);
      if (ownVariantEntries.length === 0) continue;

      const inheritedPaths = this.getInheritedBonusPaths(statPath, char);
      const allContextPaths = [...inheritedPaths, statPath];

      const baseTypeMax = new Map<string, number>();
      for (const p of allContextPaths) {
        for (const e of this.adjustmentsMap[p] || []) {
          const tKey = bonusStackingKey(e.type, e.origin);
          if (!e.variant && !e.mode && !e.overwritten && tKey && !isReservedNonNumericValue(e.value)) {
            const v = evaluateVal(e.value, char);
            if (!Number.isNaN(v)) {
              baseTypeMax.set(tKey, Math.max(baseTypeMax.get(tKey) ?? -Infinity, v));
            }
          }
        }
      }

      const variantNames = new Set(ownVariantEntries.map(e => e.variant!));
      for (const vName of variantNames) {
        const ancestorVariantEntries: AdjustmentMapEntry[] = [];
        for (const p of inheritedPaths) {
          for (const e of this.adjustmentsMap[p] || []) {
            if (e.variant === vName) ancestorVariantEntries.push(e);
          }
        }
        const ownForVariant = ownVariantEntries.filter(e => e.variant === vName);
        const combined = [...ancestorVariantEntries, ...ownForVariant].sort(
          (a, b) => (this.entryOrder.get(a) ?? 0) - (this.entryOrder.get(b) ?? 0)
        );

        const winnersByType = new Map<string, { entry: AdjustmentMapEntry; val: number }>();
        for (const e of combined) {
          const tKey = bonusStackingKey(e.type, e.origin);
          if (!tKey || isReservedNonNumericValue(e.value)) {
            if (ownForVariant.includes(e)) e.overwritten = false;
            continue;
          }
          const val = evaluateVal(e.value, char);
          const prev = winnersByType.get(tKey);
          if (!prev) {
            winnersByType.set(tKey, { entry: e, val });
          } else if (val >= prev.val) {
            if (ownForVariant.includes(prev.entry)) prev.entry.overwritten = true;
            winnersByType.set(tKey, { entry: e, val });
          } else {
            if (ownForVariant.includes(e)) e.overwritten = true;
          }
        }

        for (const [tKey, { entry, val }] of winnersByType.entries()) {
          if (!ownForVariant.includes(entry)) continue;
          const baseMax = baseTypeMax.get(tKey);
          if (baseMax !== undefined && val <= baseMax) {
            entry.overwritten = true;
          } else {
            entry.overwritten = false;
          }
        }
      }
    }
  }

  public hasBaseAutoFail(paths: string[]): boolean {
    for (const p of paths) {
      const entries = this.adjustmentsMap[p] || [];
      if (entries.some(e => !e.variant && e.value === 'auto-fail')) return true;
    }
    return false;
  }

  public computeVariantsForPaths(
    paths: string[],
    baseTotal: number | 'auto-fail',
    char: Character,
  ): VariantSummary[] {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    const rawVariantEntries: AdjustmentMapEntry[] = [];
    for (const p of uniquePaths) {
      for (const e of this.adjustmentsMap[p] || []) {
        if (e.variant !== undefined) rawVariantEntries.push(e);
      }
    }
    if (rawVariantEntries.length === 0) return [];

    const baseTypeMax = new Map<string, number>();
    for (const p of uniquePaths) {
      for (const e of this.adjustmentsMap[p] || []) {
        const tKey = bonusStackingKey(e.type, e.origin);
        if (!e.variant && !e.mode && !e.overwritten && tKey && !isReservedNonNumericValue(e.value)) {
          const v = evaluateVal(e.value, char);
          if (!Number.isNaN(v)) {
            baseTypeMax.set(tKey, Math.max(baseTypeMax.get(tKey) ?? -Infinity, v));
          }
        }
      }
    }

    const grouped = new Map<string, AdjustmentMapEntry[]>();
    for (const e of rawVariantEntries) {
      const vName = e.variant!;
      if (!grouped.has(vName)) grouped.set(vName, []);
      grouped.get(vName)!.push(e);
    }

    const isSpeedStat = uniquePaths.some(p => p.startsWith('speed.'));
    const baseAlreadyHalved =
      isSpeedStat &&
      uniquePaths.some(p => (this.adjustmentsMap[p] || []).some(e => !e.variant && e.value === 'half'));

    const summaries: VariantSummary[] = [];
    for (const [vName, entries] of grouped.entries()) {
      const ordered = [...entries].sort(
        (a, b) => (this.entryOrder.get(a) ?? 0) - (this.entryOrder.get(b) ?? 0)
      );

      const overwrittenState = new Map<AdjustmentMapEntry, boolean>();
      const winnersByType = new Map<string, { entry: AdjustmentMapEntry; val: number }>();
      let untypedSum = 0;
      let hasVariantAutoFail = false;
      let hasVariantHalf = false;

      for (const e of ordered) {
        if (e.value === 'auto-fail') {
          hasVariantAutoFail = true;
          overwrittenState.set(e, false);
          continue;
        }
        if (e.value === 'half' && isSpeedStat) {
          hasVariantHalf = true;
          overwrittenState.set(e, false);
          continue;
        }
        if (typeof e.value === 'boolean') {
          overwrittenState.set(e, false);
          continue;
        }
        const val = evaluateVal(e.value, char);
        const tKey = bonusStackingKey(e.type, e.origin);
        if (!tKey) {
          untypedSum += Number.isNaN(val) ? 0 : val;
          overwrittenState.set(e, false);
        } else {
          const prev = winnersByType.get(tKey);
          if (!prev) {
            winnersByType.set(tKey, { entry: e, val });
            overwrittenState.set(e, false);
          } else if (val >= prev.val) {
            overwrittenState.set(prev.entry, true);
            winnersByType.set(tKey, { entry: e, val });
            overwrittenState.set(e, false);
          } else {
            overwrittenState.set(e, true);
          }
        }
      }

      let typedDelta = 0;
      for (const [tKey, { entry, val }] of winnersByType.entries()) {
        const baseMax = baseTypeMax.get(tKey);
        if (baseMax !== undefined) {
          if (val > baseMax) {
            typedDelta += val - baseMax;
            overwrittenState.set(entry, false);
          } else {
            overwrittenState.set(entry, true);
          }
        } else {
          typedDelta += val;
          overwrittenState.set(entry, false);
        }
      }

      let total: number | 'auto-fail';
      if (baseTotal === 'auto-fail' || hasVariantAutoFail) {
        total = 'auto-fail';
      } else {
        total = Number(baseTotal) + untypedSum + typedDelta;
        if (hasVariantHalf && !baseAlreadyHalved && total > 0) {
          total = Math.floor(total / 10) * 5;
        }
      }

      summaries.push({
        name: vName,
        total,
        entries: ordered.map(e => ({
          entry: e,
          overwritten: overwrittenState.get(e) ?? e.overwritten,
        })),
      });
    }

    return summaries;
  }

  applyFeatureList(char: Character, featureList: Feature[]) {
    if (!Array.isArray(featureList)) return;
    for (const feature of featureList) {
      if (!feature || feature.active === false) continue;
      try {
        if (feature.adjustments) {
          // a feature can still hold damage reduction as it was saved before it was kept by bypass
          for (const [rawKey, rawAdj] of Object.entries(migrateDamageReductionAdjustments(feature.adjustments))) {
            if (!checkConditionals(rawAdj, this.activeFeatureNames)) continue;

            const isWrapper = isAdjustmentWrapperObject(rawAdj);
            const value = isWrapper ? rawAdj.value : rawAdj;
            const type = isWrapper ? (rawAdj.type || '') : '';
            const mode = modeOf(rawAdj);

            const variantMatch = /^(.+?)\[([^\]]*)\]$/.exec(rawKey);
            const pathWithoutVariant = variantMatch ? variantMatch[1] : rawKey;
            const variant = variantMatch ? variantMatch[2].trim() : undefined;

            if (
              pathWithoutVariant.startsWith('skills.') &&
              (pathWithoutVariant.includes('*') || pathWithoutVariant.includes('@'))
            ) {
              this.skillSelectorAdjustments.push({
                pathWithoutVariant,
                variant,
                origin: feature.name || '',
                value,
                type,
                ...(mode ? { mode } : {}),
              });
              continue;
            }

            if (pathWithoutVariant.includes('@')) {
              continue;
            }

            const normalizedSkillPath = this.normalizeConcreteSkillPath(char, pathWithoutVariant);
            if (normalizedSkillPath === null) continue;

            const concretePaths = this.expandObjectWildcards(char, normalizedSkillPath);
            for (const adjusting of concretePaths) {
              const adjustmentMapEntry: AdjustmentMapEntry = {
                adjusting,
                origin: feature.name || '',
                value,
                type,
                overwritten: false,
                ...(variant !== undefined ? { variant } : {}),
                ...(mode ? { mode } : {}),
              };
              for (const entry of [adjustmentMapEntry, ...this.derivedAcAdjustments(char, adjustmentMapEntry)]) {
                this.trackAdjustment(char, entry);
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  update(update: Partial<Character> = {}) {
    this.raw.update((char: Character) => ({...char, ...update}));
    const changed = this.history.record(this.raw(), this.action?.label, this.action?.recorded);
    if (this.action && changed) this.action.recorded = true;
  }

  // the raw character's own object for a feature of the applied character. the applied character starts as a copy of
  // the raw one, so the features the character keeps itself (its feats, special qualities, ...) are copies there,
  // while those other features give are the raw objects: changing a copy changes nothing. found by id, anywhere in
  // the raw character (its lists, its items, the features its features give)
  rawFeature<T extends {id?: string}>(feature: T): T {
    if (!feature?.id) return feature;
    const seen = new Set<object>();
    const find = (value: unknown): T | undefined => {
      if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
      seen.add(value);
      if (!Array.isArray(value) && (value as {id?: unknown}).id === feature.id && value !== feature) return value as T;
      for (const child of Array.isArray(value) ? value : Object.values(value)) {
        const found = find(child);
        if (found) return found;
      }
      return undefined;
    };
    return find(this.raw()) || feature;
  }

  // turns a feature on or off, spends a use of it or gives its uses back, on the raw character (see rawFeature)
  setFeatureActive(feature: Feature, active: boolean): void {
    const own = this.rawFeature(feature);
    this.labelled(`turn ${own.name || 'a feature'} ${active ? 'on' : 'off'}`, () => {
      own.active = active;
      this.update();
    });
  }

  useFeatureCharges(feature: Feature, uses = 1): void {
    const own = this.rawFeature(feature);
    if (!own.charges) return;
    const charges = own.charges;
    this.labelled(`use ${own.name || 'a feature'}${uses > 1 ? ` x${uses}` : ''}`, () => {
      charges.current = (Number(charges.current) || 0) - uses;
      this.update();
    });
  }

  resetFeatureCharges(feature: Feature): void {
    const own = this.rawFeature(feature);
    if (!own.charges) return;
    const charges = own.charges;
    this.labelled(`reset the uses of ${own.name || 'a feature'}`, () => {
      charges.current = charges.total;
      this.update();
    });
  }

  // the conditions the sheet offers (Blinded, Fatigued, ...), to put on the character with consumeFeature
  conditionTemplates(): Feature[] {
    return this.conditionsService.list;
  }

  // runs an action whose changes undo as one step, named label ("cast Bless"). an action inside another is part of it
  labelled<T>(label: string, action: () => T): T {
    if (this.action) return action();
    this.action = {label, recorded: false};
    try {
      return action();
    } finally {
      this.action = undefined;
    }
  }

  // takes the last change back (or brings the last change undone back), what it was, undefined when there was none
  undo(): string | undefined {
    return this.restore(this.history.undoLabel(), this.history.undo(this.raw()));
  }

  redo(): string | undefined {
    return this.restore(this.history.redoLabel(), this.history.redo(this.raw()));
  }

  private restore(label: string | undefined, character: Character | undefined): string | undefined {
    if (!character) return undefined;
    // what the last rest and cast said is about a character that is no longer the one shown
    this.lastRest.set(undefined);
    this.lastCast.set(undefined);
    this.raw.set(character);
    return label ?? 'the last change';
  }

  // the raw sources of a caster, see rules/spell-sources.ts
  private rawSpellArrays(type: SpellCastingType, origin: string, levelIndex: number): Spell[][] {
    return rawSpellArrays(this.raw(), type, origin, levelIndex, this.featureListLocations);
  }

  private rawSpellLevelSources(type: SpellCastingType, origin: string, levelIndex: number): SpellLevel[] {
    return rawSpellLevelSources(this.raw(), type, origin, levelIndex, this.featureListLocations);
  }

  private ensureRawCaster(
    type: SpellCastingType,
    origin: string,
    casterValues: Partial<CasterType> = {},
  ): CasterType {
    const collection = this.raw()[type];
    if (!collection[origin]) {
      const alreadyApplied = !!this.applied()[type][origin];
      collection[origin] = {
        ...emptyCaster(),
        ...casterValues,
        name: casterValues.name || (alreadyApplied ? '' : origin),
        // A direct entry extending a feature-defined caster must not count its
        // caster level a second time in the applied character.
        casterLevel: alreadyApplied ? 0 : casterValues.casterLevel ?? 0,
        concentration: alreadyApplied ? 0 : casterValues.concentration ?? 0,
        spells: [],
      };
    }
    return collection[origin];
  }

  // the spell level of the caster itself (not of a feature), where what the character does with its spells is kept:
  // the spells it prepared, the slots it spent of a class caster
  private ensureRawSpellLevel(type: SpellCastingType, origin: string, levelIndex: number): SpellLevel {
    const caster = this.ensureRawCaster(type, origin);
    while (caster.spells.length <= levelIndex) caster.spells.push(emptySpellLevel());
    if (!caster.spells[levelIndex]) caster.spells[levelIndex] = emptySpellLevel();
    return caster.spells[levelIndex];
  }

  // spends one use of a spell level, slot 'extra' spends its domain or school slot instead (see rules/spellcasting.ts)
  // 0-level spells of a class caster are cast at will and spend nothing
  // a raw source of charges is spent first, then the slots the rules gave (counted in the raw level's used)
  // a level without any uses per day that is not a class caster's casts freely, as it always did
  consumeSpellLevel(type: SpellCastingType, origin: string, levelIndex: number, slot: 'regular' | 'extra' = 'regular'): boolean {
    const appliedCaster = this.applied()[type][origin];
    const appliedLevel = appliedCaster?.spells[levelIndex];
    if (appliedLevel?.atWill) return true;
    if (slot === 'extra') {
      if (!appliedLevel?.extraSlot || appliedLevel.extraSlot.current <= 0) return false;
      const rawLevel = this.ensureRawSpellLevel(type, origin, levelIndex);
      rawLevel.extraUsed = (Number(rawLevel.extraUsed) || 0) + 1;
      this.update();
      return true;
    }
    const levels = this.rawSpellLevelSources(type, origin, levelIndex);
    const source = levels.find(level => level.perDay.current > 0);
    const appliedCharges = appliedLevel?.perDay;
    if (!source) {
      if (appliedCharges && appliedCharges.current > 0) {
        const rawLevel = this.ensureRawSpellLevel(type, origin, levelIndex);
        rawLevel.used = (Number(rawLevel.used) || 0) + 1;
        this.update();
        return true;
      }
      return !appliedCaster?.classTable && appliedCharges?.total === 0;
    }
    source.perDay.current = Math.max(0, source.perDay.current - 1);
    this.update();
    return true;
  }

  // a rest: every use of the level comes back and its prepared spells can be cast again
  resetSpellLevel(type: SpellCastingType, origin: string, levelIndex: number, update = true): void {
    restSpellLevel(this.raw(), type, origin, levelIndex, this.featureListLocations);
    if (update) this.update();
  }

  // every level of the caster, see resetSpellLevel
  restCaster(type: SpellCastingType, origin: string): void {
    const levels = this.applied()[type][origin]?.spells || [];
    levels.forEach((level, index) => { if (level) this.resetSpellLevel(type, origin, index, false); });
    this.lastCast.set(undefined);
    this.update();
  }

  // what the last rest did, the sheet shows it after the rest, see rules/rest.ts
  public lastRest: WritableSignal<RestSummary | undefined> = signal(undefined);

  // the character rests (a night, or a full day of bed rest, with long-term care or not): it heals, its spell slots and
  // daily charges come back, its fatigue goes, see restChange. a dying or dead character does not rest, nothing changes
  rest(options: Pick<RestOptions, 'kind' | 'longTermCare'>): RestSummary {
    return this.labelled(options.kind === 'bedRest' ? 'a day of bed rest' : 'rest for the night', () => this.restNow(options));
  }

  private restNow(options: Pick<RestOptions, 'kind' | 'longTermCare'>): RestSummary {
    const {change, summary} = restChange(this.raw(), this.applied(), {
      kind: options.kind,
      longTermCare: options.longTermCare,
      conditionTemplates: this.conditionsService.list,
      featureListLocations: this.featureListLocations,
    });
    if (summary.rested) {
      this.lastCast.set(undefined);
      this.update(change);
    }
    this.lastRest.set(summary);
    return summary;
  }

  // a prepared caster prepares a spell of its list into a free slot of the level, or into its extra slot (domain or
  // school spells only). a spell of an opposition school takes two slots. gives why it could not, if it could not
  prepareSpell(origin: string, levelIndex: number, spellName: string, slot: 'regular' | 'extra' = 'regular'): string | undefined {
    const caster = this.applied().spells[origin];
    const level = caster?.spells[levelIndex];
    const spell = level?.spells.find(({name}) => name.toLowerCase() === spellName.toLowerCase());
    if (!caster || !level || !spell) return 'not on the list of the caster';
    if (slot === 'extra') {
      if (!level.extraSlot) return 'no extra slot at this level';
      if (!fitsExtraSlot(caster, spell)) return `not a ${level.extraSlot.kind} spell`;
      if ((level.prepared || []).some(prepared => prepared.slot === 'extra')) return 'the extra slot is taken';
    } else {
      const needed = isOppositionSpell(caster, spell) ? 2 : 1;
      if (preparedSlotsUsed(caster, level) + needed > level.perDay.total) return 'no free slot at this level';
    }
    const rawLevel = this.ensureRawSpellLevel('spells', origin, levelIndex);
    rawLevel.prepared = [...(rawLevel.prepared || []), {name: spell.name, ...(slot === 'extra' ? {slot} : {})}];
    this.update();
    return undefined;
  }

  unprepareSpell(origin: string, levelIndex: number, preparedIndex: number): void {
    const prepared = this.raw().spells[origin]?.spells?.[levelIndex]?.prepared;
    if (!prepared?.[preparedIndex]) return;
    prepared.splice(preparedIndex, 1);
    this.update();
  }

  // the choices of a caster (a cleric's domains, a wizard's school and opposition schools), kept on the raw caster
  setCasterChoice(origin: string, choice: 'domains' | 'oppositionSchools' | 'school', value: string): void {
    const caster = this.ensureRawCaster('spells', origin);
    const list = value.split(',').map(entry => entry.trim()).filter(Boolean);
    if (choice === 'school') {
      if (value.trim()) caster.school = value.trim(); else delete caster.school;
    } else if (list.length) caster[choice] = list;
    else delete caster[choice];
    this.update();
  }

  // the last spell cast, what the sheet shows of it (its spell failure roll)
  public lastCast: WritableSignal<CastResult | undefined> = signal(undefined);

  // casts a spell (Core Rulebook, chapter 9):
  //  - a caster can not cast spells above its maxSpellLevel (casting ability score - 10)
  //  - a prepared class caster casts a prepared instance of the spell (preparedIndex, or the first one not cast yet),
  //    it spends the slot it was prepared in. a 0-level spell is cast at will, but must be prepared
  //  - any other caster spends a use of the level
  //  - a spell with a somatic component of an arcane caster rolls d% against its arcane spell failure, any spell
  //    against the spell failure chance of the character (see spellFailureChanceFor). a failed spell still spends
  //    its slot, and does not take effect (no adjustments on self)
  cast(
    type: SpellCastingType, origin: string, levelIndex: number, spell: Spell,
    options: {onSelf?: boolean, preparedIndex?: number} = {},
  ): CastResult {
    return this.labelled(`cast ${spell.name}`, () => this.castNow(type, origin, levelIndex, spell, options));
  }

  private castNow(
    type: SpellCastingType, origin: string, levelIndex: number, spell: Spell,
    options: {onSelf?: boolean, preparedIndex?: number},
  ): CastResult {
    const result: CastResult = {spell: spell.name, origin, level: levelIndex, spent: false, success: false};
    const finish = (): CastResult => { this.lastCast.set(result); return result; };
    const caster = this.applied()[type][origin];
    if (type === 'spells' && caster?.maxSpellLevel !== undefined && levelIndex > caster.maxSpellLevel) {
      result.reason = `${caster.ability} too low for level ${levelIndex} spells`;
      return finish();
    }

    if (type === 'spells' && caster?.casting === 'prepared') {
      const rawPrepared = this.raw().spells[origin]?.spells?.[levelIndex]?.prepared || [];
      const atWill = !!caster.spells[levelIndex]?.atWill;
      const usable = (index: number): boolean => !!rawPrepared[index]
        && rawPrepared[index].name.toLowerCase() === spell.name.toLowerCase()
        && (atWill || !rawPrepared[index].cast);
      const index = options.preparedIndex !== undefined
        ? (usable(options.preparedIndex) ? options.preparedIndex : -1)
        : rawPrepared.findIndex((_prepared, i) => usable(i));
      if (index === -1) {
        result.reason = 'not prepared';
        return finish();
      }
      const prepared = rawPrepared[index];
      if (!this.consumeSpellLevel(type, origin, levelIndex, prepared.slot === 'extra' ? 'extra' : 'regular')) {
        result.reason = 'no slot left';
        return finish();
      }
      if (!atWill) prepared.cast = true;
    } else if (!this.consumeSpellLevel(type, origin, levelIndex)) {
      result.reason = 'no slot left';
      return finish();
    }
    result.spent = true;

    const chance = type === 'spells' && caster
      ? spellFailureChanceFor(this.applied(), caster, spell, this.verbalSpellFailure())
      : 0;
    if (chance > 0) {
      result.chance = chance;
      result.roll = this.percentileRoll();
      if (result.roll <= chance) {
        result.reason = 'spell failure';
        this.update();
        return finish();
      }
    }
    result.success = true;

    if (options.onSelf && spell.adjustments) {
      this.raw().conditions.push(new Feature({
        name: spell.name,
        description: spell.description,
        adjustments: clone(spell.adjustments),
        active: true,
      }));
    }
    this.update();
    return finish();
  }

  // spends the slot of the spell and casts it, see cast. whether a slot was spent
  castSpell(type: SpellCastingType, origin: string, levelIndex: number, spell: Spell, onSelf = false): boolean {
    return this.cast(type, origin, levelIndex, spell, {onSelf}).spent;
  }

  // the spell failure only spells with a verbal component have (spellFailureChance[verbal], deafened)
  private verbalSpellFailure(): number {
    this.applied();
    return (this.adjustmentsMap['spellFailureChance'] || [])
      .filter(entry => entry.variant?.toLowerCase() === 'verbal' && !entry.overwritten)
      .reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
  }

  saveSpell(
    type: SpellCastingType,
    origin: string,
    levelIndex: number,
    spell: Spell,
    casterValues: Partial<CasterType> = {},
    original?: {origin: string, levelIndex: number, name: string},
    spellLevelValues: Partial<SpellLevel> = {},
  ): void {
    if (original && (original.origin !== origin || original.levelIndex !== levelIndex)) {
      this.deleteSpell(type, original.origin, original.levelIndex, original.name, false);
    }

    const lookupOrigin = original?.origin === origin && original.levelIndex === levelIndex ? origin : '';
    const spellArrays = lookupOrigin ? this.rawSpellArrays(type, origin, levelIndex) : [];
    const existing = spellArrays
      .map(spells => spells.find(candidate => candidate.name === original?.name))
      .find((candidate): candidate is Spell => !!candidate);
    if (existing) {
      Object.assign(existing, clone(spell));
    } else {
      const caster = this.ensureRawCaster(type, origin, casterValues);
      if (!caster.spells[levelIndex]) {
        const appliedLevelExists = !!this.applied()[type][origin]?.spells[levelIndex];
        while (caster.spells.length <= levelIndex) caster.spells.push(emptySpellLevel());
        if (!caster.spells[levelIndex]) caster.spells[levelIndex] = emptySpellLevel();
        if (!appliedLevelExists && spellLevelValues.perDay) {
          caster.spells[levelIndex].perDay = clone(spellLevelValues.perDay);
        }
      }
      caster.spells[levelIndex].spells.push(clone(spell));
    }
    this.update();
  }

  deleteSpell(
    type: SpellCastingType,
    origin: string,
    levelIndex: number,
    spellName: string,
    update = true,
  ): void {
    for (const spells of this.rawSpellArrays(type, origin, levelIndex)) {
      for (let index = spells.length - 1; index >= 0; index--) {
        if (spells[index].name === spellName) spells.splice(index, 1);
      }
    }
    if (update) this.update();
  }

  consumeFeature({feature, destination}:{feature: Feature|Item, destination: string}) {
    this.labelled(`add ${feature.name || 'a feature'}`, () => this.consumeFeatureNow(feature, destination));
  }

  private consumeFeatureNow(feature: Feature|Item, destination: string) {
    const objdestination = getByPath(this.raw(), destination as string);
    const isConditionTemplate =
      destination === 'conditions' && this.conditionsService.list.includes(feature as Feature);
    const toStore = isConditionTemplate
      ? {
          ...clone(feature),
          ...((feature.name || '').trim().toLowerCase() === 'energy drained' ? { id: v4() } : {}),
        }
      : feature;

    const featureIndex = objdestination.findIndex(byId(toStore.id));
    if (featureIndex === -1) objdestination.push(toStore);
    else objdestination.splice(featureIndex, 1, toStore);

    this.update();
  }

  removeFeature<Item>(list: Item[], feature: Item): void;
  removeFeature<Feature>(list: Feature[], feature: Feature): void;
  removeFeature<Ltype extends {id: string}>(list: Ltype[], feature: Ltype): void {
    const featureIndex = list.findIndex(byId(feature.id));
    if (featureIndex === -1) return;
    this.labelled(`remove ${(feature as {name?: string}).name || 'a feature'}`, () => {
      list.splice(featureIndex, 1);
      this.update();
    });
  }

}
