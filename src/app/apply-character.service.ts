import { Injectable, Signal, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import {Character} from './utils/character.class';
import {ls} from './utils/localstorage.util';
import {
  CasterType,
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
import {assignByPath, evaluateVal, getByPath} from './utils/object.util';
import {Item} from './utils/item.class';
import {AbilityModPipe} from './ability-mod.pipe';
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
}

interface ConditionCandidate {
  feature: Feature;
  rawIndex: number;
  includedBy?: Set<ConditionCandidate>;
  suppressed?: boolean;
}

const byId = (id: string) => (f: any): boolean => f.id === id;
export type SpellCastingType = 'spells'|'spellLikeAbilities';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
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

const isReservedNonNumericValue = (value: any): boolean =>
  value === 'auto-fail' || value === 'half' || typeof value === 'boolean';

// Spell casting adjustments merge by caster origin and spell level. This lets
// class levels establish a caster while feats, conditions and other features
// add slots or spells without replacing the rest of its spellbook.
const mergeSpellLevel = (target: SpellLevel, incoming: Partial<SpellLevel>): void => {
  if (incoming.perDay) {
    target.perDay.total += Number(incoming.perDay.total) || 0;
    target.perDay.current += Number(incoming.perDay.current) || 0;
    if (incoming.perDay.label) target.perDay.label = incoming.perDay.label;
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

const mergeCaster = (target: CasterType, incoming: Partial<CasterType>): void => {
  if (incoming.name && !target.name) target.name = incoming.name;
  if (incoming.ability && !target.ability) target.ability = incoming.ability;
  target.casterLevel += Number(incoming.casterLevel) || 0;
  target.concentration += Number(incoming.concentration) || 0;
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
  if (value === 'auto-fail' || value === 'half') return false;
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

  public featureListLocations = ['race.features', 'conditions', 'feats', 'specialAttack'];

  public adjustmentsMap: {[key: string]: AdjustmentMapArray} = {};
  private postAdjustments: AdjustmentMapEntry[] = [];
  private skillSelectorAdjustments: DeferredSkillSelectorAdjustment[] = [];
  private suppressedConditionIndices: Set<number> = new Set();
  private activeFeatureNames: Set<string> = new Set();
  private entryOrder = new WeakMap<AdjustmentMapEntry, number>();
  private nextEntrySeq = 0;
  private rawOpenSubSkills: { [family: string]: SkillObj } = {};
  private classSkillEntries: Set<string> = new Set();

  public raw: WritableSignal<Character> = signal(new Character());

  public isConditionSuppressed(index: number): boolean {
    this.applied();
    return this.suppressedConditionIndices.has(index);
  }

  public applied: Signal<Character> = computed(() => {
    const character = this.raw();
    this.adjustmentsMap = {};
    this.postAdjustments = [];
    this.skillSelectorAdjustments = [];
    this.suppressedConditionIndices = new Set();
    this.activeFeatureNames = new Set();
    this.entryOrder = new WeakMap();
    this.nextEntrySeq = 0;
    this.rawOpenSubSkills = {};
    this.classSkillEntries = new Set();

    const appliedChar = JSON.parse(JSON.stringify(character)) as Character;
    this.ensureCharacterDefaults(appliedChar, character);

    for (const classLevel of character.classLevels || []) {
      for (const skillName of classLevel.classSkills || []) {
        this.classSkillEntries.add(skillName.trim().toLowerCase());
      }
    }
    this.applyInitialClassSkills(appliedChar);

    const { effectiveConditions, suppressedIndices, activeNames } = this.resolveFeaturesAndConditions(appliedChar);
    this.suppressedConditionIndices = suppressedIndices;
    this.activeFeatureNames = activeNames;

    // apply classLevel
    for (const [ind, classLevel] of (character.classLevels || []).entries()) {
      // assign HP level
      appliedChar.hp += (ind === 0 ? classLevel.hitDice : classLevel.rolledHp);
      // apply class features
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
      if (item.equipped) return [...cur, ...(item.features || [])];
      else return cur;
    }, [] as Feature[]));

    // If any features after 'conditions' pushed new conditions onto appliedChar.conditions, apply non-duplicate ones
    if ((appliedChar.conditions || []).length > initialRawConditionsCount) {
      const lateConditions = appliedChar.conditions.slice(initialRawConditionsCount);
      this.applyLateConditions(appliedChar, lateConditions);
    }

    // assign mod dependant things after features have been processed
    appliedChar.hp += AbilityModPipe.algorithm(appliedChar.abilityScores.con) * (character.classLevels?.length || 0);
    for (const entry of this.postAdjustments) this.assignToChar(appliedChar, entry);

    // Expand and apply selector adjustments under skills.* after all non-selector adjustments
    this.applyDeferredSkillSelectors(appliedChar);

    // Apply half speed after everything else that adjusts speed
    this.applyHalfSpeeds(appliedChar);

    // Settle overwritten flags on variant entries
    this.settleAllVariantOverwrittenFlags(appliedChar);

    console.log('Applied Character', appliedChar, this.adjustmentsMap);

    return appliedChar;
  });

  public saveOnUpdate: boolean = false;

  constructor() {
    effect(() => {
      if (!this.saveOnUpdate) return;
      const rawChar = this.raw();
      console.log('Saving Raw Character', rawChar);
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
    appliedChar.maxDexBonus ??= 0;
    appliedChar.armorCheckPenalty ??= 0;
    appliedChar.arcaneSpellFailureChance ??= 0;
    appliedChar.spellFailureChance ??= 0;
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

  private resolveConditionsList(rawConditions: Feature[], extraConditions: Feature[]): {
    effectiveConditions: Feature[];
    suppressedIndices: Set<number>;
  } {
    const candidates: ConditionCandidate[] = [];
    rawConditions.forEach((cond, idx) => {
      if (cond && cond.active !== false) {
        candidates.push({ feature: clone(cond), rawIndex: idx });
      }
    });
    for (const cond of extraConditions) {
      if (cond && cond.active !== false) {
        candidates.push({ feature: clone(cond), rawIndex: -1 });
      }
    }

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

    const effectiveConditions = allCandidates
      .filter(cand => !cand.suppressed)
      .map(cand => cand.feature);

    return { effectiveConditions, suppressedIndices };
  }

  private resolveFeaturesAndConditions(char: Character): {
    effectiveConditions: Feature[];
    suppressedIndices: Set<number>;
    activeNames: Set<string>;
  } {
    let activeNames = new Set<string>();
    let effectiveConditions: Feature[] = [];
    let suppressedIndices = new Set<number>();

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
        ...(char.inventory || []).filter(item => item.equipped).flatMap(item => item.features || []),
      ];

      const nextNames = new Set<string>();
      const grantedConditions: Feature[] = [];
      collectNestedFeatures(nonConditionRoots, activeNames, nextNames, grantedConditions, false);

      const resolved = this.resolveConditionsList(char.conditions || [], grantedConditions);
      effectiveConditions = resolved.effectiveConditions;
      suppressedIndices = resolved.suppressedIndices;

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

    return { effectiveConditions, suppressedIndices, activeNames };
  }

  private applyLateConditions(char: Character, lateConditions: Feature[]): void {
    // Only needed if a feat/item dynamically pushed a condition that wasn't already in effectiveConditions
    for (const cond of lateConditions) {
      if (!cond || cond.active === false) continue;
      const cName = (cond.name || '').trim().toLowerCase();
      if (cName && this.activeFeatureNames.has(cName) && cName !== 'energy drained') continue;
      this.applyFeatureList(char, [cond]);
    }
  }

  initializeCharacter(character: Character, saveOnUpdate: boolean = false) {
    // Characters saved before origin-based casting used arrays for these fields.
    // There was no spell data in that shape, so migrate it to an empty map.
    if (Array.isArray(character.spells) || !character.spells) character.spells = {};
    if (Array.isArray(character.spellLikeAbilities) || !character.spellLikeAbilities) character.spellLikeAbilities = {};
    this.saveOnUpdate = saveOnUpdate;
    this.raw.set(character);
  }

  assignToChar(char: Character, adjustmentMapEntry: AdjustmentMapEntry) {
    if (adjustmentMapEntry.variant !== undefined) return;
    if (adjustmentMapEntry.value === 'auto-fail') return;
    if (adjustmentMapEntry.value === 'half' && adjustmentMapEntry.adjusting.startsWith('speed.')) return;
    if (this.assignSpellCastingAdjustment(char, adjustmentMapEntry)) return;
    if (adjustmentMapEntry.type && !['ranged', 'melee'].includes(adjustmentMapEntry.adjusting)) {
      const typeKey = adjustmentMapEntry.type.toLowerCase();
      const mapArr = this.adjustmentsMap[adjustmentMapEntry.adjusting];
      const appliedTypeBonus = mapArr[typeKey] || mapArr[adjustmentMapEntry.type];
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
      if (adjustmentMapEntry.type !== typeKey) {
        Object.defineProperty(mapArr, adjustmentMapEntry.type, {
          value: adjustmentMapEntry,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
    }
    assignByPath(char, adjustmentMapEntry.adjusting, adjustmentMapEntry.value);
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
    if (rest === 'name' || rest === 'ability') {
      caster[rest] = entry.value;
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
    if (adjustmentMapEntry.value === 'half' && adjustmentMapEntry.adjusting.startsWith('speed.')) return;
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

  private applyDeferredSkillSelectors(char: Character): void {
    for (const deferred of this.skillSelectorAdjustments) {
      const concretePaths = this.expandSkillSelector(char, deferred.pathWithoutVariant);
      for (const adjusting of concretePaths) {
        const entry: AdjustmentMapEntry = {
          adjusting,
          origin: deferred.origin,
          value: deferred.value,
          type: deferred.type,
          overwritten: false,
          ...(deferred.variant !== undefined ? { variant: deferred.variant } : {}),
        };
        this.recordEntry(entry);
        if (entry.variant === undefined && entry.value !== 'auto-fail') {
          this.assignToChar(char, entry);
        }
      }
    }
  }

  private applyHalfSpeeds(char: Character): void {
    if (!char.speed) return;
    for (const k of Object.keys(char.speed) as (keyof typeof char.speed)[]) {
      const entries = this.adjustmentsMap[`speed.${k}`] || [];
      if (entries.some(e => !e.variant && e.value === 'half')) {
        const cur = Number(char.speed[k]) || 0;
        if (cur > 0) {
          char.speed[k] = Math.floor(cur / 10) * 5;
        }
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
          if (!e.variant && !e.overwritten && e.type && !isReservedNonNumericValue(e.value)) {
            const tKey = e.type.toLowerCase();
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
          if (!e.type || isReservedNonNumericValue(e.value)) {
            if (ownForVariant.includes(e)) e.overwritten = false;
            continue;
          }
          const tKey = e.type.toLowerCase();
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
        if (!e.variant && !e.overwritten && e.type && !isReservedNonNumericValue(e.value)) {
          const tKey = e.type.toLowerCase();
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
        if (!e.type) {
          untypedSum += Number.isNaN(val) ? 0 : val;
          overwrittenState.set(e, false);
        } else {
          const tKey = e.type.toLowerCase();
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
          for (const [rawKey, rawAdj] of Object.entries(feature.adjustments)) {
            if (!checkConditionals(rawAdj, this.activeFeatureNames)) continue;

            const isWrapper = isAdjustmentWrapperObject(rawAdj);
            const value = isWrapper ? rawAdj.value : rawAdj;
            const type = isWrapper ? (rawAdj.type || '') : '';

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
    console.log('updating character update:', update);
    this.raw.update((char: Character) => ({...char, ...update}));
  }

  private allRawFeatures(): Feature[] {
    const char = this.raw();
    const featureLists = this.featureListLocations
      .map(location => getByPath(char, location) as Feature[])
      .filter((features): features is Feature[] => Array.isArray(features));
    return [
      ...char.classLevels.flatMap(classLevel => classLevel.features),
      ...featureLists.flat(),
      ...char.inventory.filter(item => item.equipped).flatMap(item => item.features),
    ].filter(feature => feature?.active !== false);
  }

  private rawCasterSources(type: SpellCastingType, origin: string): CasterType[] {
    const sources: CasterType[] = [];
    const direct = this.raw()[type][origin];
    if (direct) sources.push(direct);

    for (const feature of this.allRawFeatures()) {
      const rootCaster = (feature.adjustments?.[type] as SpellCasting|undefined)?.[origin];
      const originCaster = feature.adjustments?.[`${type}.${origin}`] as CasterType|undefined;
      if (rootCaster) sources.push(rootCaster);
      if (originCaster && originCaster !== rootCaster) sources.push(originCaster);
    }
    return sources;
  }

  private rawSpellArrays(type: SpellCastingType, origin: string, levelIndex: number): Spell[][] {
    const arrays = this.rawSpellLevelSources(type, origin, levelIndex)
      .map(level => level.spells)
      .filter((spells): spells is Spell[] => Array.isArray(spells));

    for (const feature of this.allRawFeatures()) {
      const adjustment = feature.adjustments?.[`${type}.${origin}.spells.${levelIndex}.spells`];
      if (Array.isArray(adjustment)) arrays.push(adjustment);
    }
    return arrays;
  }

  private rawSpellLevelSources(type: SpellCastingType, origin: string, levelIndex: number): SpellLevel[] {
    const sources = this.rawCasterSources(type, origin)
      .map(caster => caster.spells?.[levelIndex])
      .filter((level): level is SpellLevel => !!level);

    for (const feature of this.allRawFeatures()) {
      const levels = feature.adjustments?.[`${type}.${origin}.spells`];
      const level = feature.adjustments?.[`${type}.${origin}.spells.${levelIndex}`];
      if (Array.isArray(levels) && levels[levelIndex]) sources.push(levels[levelIndex]);
      if (level?.perDay && !sources.includes(level)) sources.push(level);
    }
    return sources;
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

  consumeSpellLevel(type: SpellCastingType, origin: string, levelIndex: number): boolean {
    const levels = this.rawSpellLevelSources(type, origin, levelIndex);
    const source = levels.find(level => level.perDay.current > 0);
    const appliedCharges = this.applied()[type][origin]?.spells[levelIndex]?.perDay;
    if (!source) return appliedCharges?.total === 0;
    source.perDay.current = Math.max(0, source.perDay.current - 1);
    this.update();
    return true;
  }

  resetSpellLevel(type: SpellCastingType, origin: string, levelIndex: number): void {
    for (const level of this.rawSpellLevelSources(type, origin, levelIndex)) {
      level.perDay.current = level.perDay.total;
    }
    this.update();
  }

  castSpell(type: SpellCastingType, origin: string, levelIndex: number, spell: Spell, onSelf = false): boolean {
    const cast = this.consumeSpellLevel(type, origin, levelIndex);
    if (cast && onSelf && spell.adjustments) {
      this.raw().conditions.push(new Feature({
        name: spell.name,
        description: spell.description,
        adjustments: clone(spell.adjustments),
        active: true,
      }));
      this.update();
    }
    return cast;
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
    list.splice(featureIndex, 1);
    this.update();
  }

}
