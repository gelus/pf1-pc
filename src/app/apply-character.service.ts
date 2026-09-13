import { Injectable, Signal, WritableSignal, computed, effect, signal } from '@angular/core';
import {Character} from './utils/character.class';
import {ls} from './utils/localstorage.util';
import {
  CasterType,
  Feature,
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

// AdjustmentMapArray is used to track what adjustments apply to a stat
// its an array, but can have additional bonus type properties to track which adjustment is being applied per bonus
type AdjustmentMapArray = AdjustmentMapEntry[] & { [key: string]: AdjustmentMapEntry };
interface AdjustmentMapEntry {
  adjusting: string;
  origin: string;
  value: any;
  type: string;
  overwritten: boolean;
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

  public featureListLocations = ['race.features', 'conditions', 'feats', 'specialAttack' ]

  public adjustmentsMap: {[key: string]: AdjustmentMapArray} = {};
  private postAdjustments: AdjustmentMapArray = [] as unknown as AdjustmentMapArray;
  public raw: WritableSignal<Character> = signal(new Character());

  public applied: Signal<Character> = computed(() => {
    const character = this.raw();
    this.adjustmentsMap = {};
    this.postAdjustments = [] as unknown as AdjustmentMapArray;
    const appliedChar = JSON.parse(JSON.stringify(character)) as Character;

    // apply classLevel
    for (const [ind, classLevel] of character.classLevels.entries()) {
      // assign HP level
      appliedChar.hp += (ind === 0 ? classLevel.hitDice : classLevel.rolledHp);
      // assign class skills
      for (const skillName of classLevel.classSkills) {
        appliedChar.skills[skillName.toLowerCase()].classSkill = true;
      }
      // apply class features
      this.applyFeatureList(appliedChar, classLevel.features);
    }

    // apply features from feature Lists
    for(const location of this.featureListLocations) {
      this.applyFeatureList(appliedChar, getByPath(appliedChar, location));
    }

    // apply features from inventory
    this.applyFeatureList(appliedChar, appliedChar.inventory.reduce((cur, item): Feature[] => {
      if (item.equipped) return [...cur, ...item.features];
      else return cur;
    }, [] as Feature[]))

    // assign mod dependant things after features have been processed
    appliedChar.hp += AbilityModPipe.algorithm(appliedChar.abilityScores.con) * character.classLevels.length
    for (let entry of this.postAdjustments) this.assignToChar(appliedChar, entry);

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

  initializeCharacter(character: Character, saveOnUpdate: boolean = false) {
    // Characters saved before origin-based casting used arrays for these fields.
    // There was no spell data in that shape, so migrate it to an empty map.
    if (Array.isArray(character.spells) || !character.spells) character.spells = {};
    if (Array.isArray(character.spellLikeAbilities) || !character.spellLikeAbilities) character.spellLikeAbilities = {};
    this.saveOnUpdate = saveOnUpdate;
    this.raw.set(character);
  }

  assignToChar(char: Character, adjustmentMapEntry:AdjustmentMapEntry) {
    if (this.assignSpellCastingAdjustment(char, adjustmentMapEntry)) return;
    if (adjustmentMapEntry.type && !['ranged', 'melee'].includes(adjustmentMapEntry.adjusting)) {
      const appliedTypeBonus = this.adjustmentsMap[adjustmentMapEntry.adjusting][adjustmentMapEntry.type];
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
      this.adjustmentsMap[adjustmentMapEntry.adjusting][adjustmentMapEntry.type] = adjustmentMapEntry;
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

  // keeps track of what adjusts a stat, so the sheet can show where its value came from, and applies it
  // adjustments depending on ability mods (or hitting every attack) wait until everything else has been applied
  trackAdjustment(char: Character, adjustmentMapEntry: AdjustmentMapEntry) {
    const adjusting = adjustmentMapEntry.adjusting;
    if (!this.adjustmentsMap[adjusting]) this.adjustmentsMap[adjusting] = [] as unknown as AdjustmentMapArray;
    this.adjustmentsMap[adjusting].push(adjustmentMapEntry);
    if (/{(mod|stat):/.test(adjustmentMapEntry.value) || /\.\*\./.test(adjusting)) this.postAdjustments.push(adjustmentMapEntry)
    else this.assignToChar(char, adjustmentMapEntry);
  }

  applyFeatureList(char: Character, featureList: Feature[]) {
    for (const feature of featureList) {
      if (feature.active === false) continue;
      try {
        if (feature.adjustments) {
          for (const [adjusting, adjustment] of Object.entries(feature.adjustments)) {
            const adjustmentMapEntry: AdjustmentMapEntry = {
              adjusting,
              origin: feature.name || '',
              // `?? `, not `||`, so a typed adjustment worth 0 keeps its value instead of falling back to the whole object
              value: adjustment?.value ?? adjustment,
              type: adjustment?.type || '',
              overwritten: false,
            };
            for (const entry of [adjustmentMapEntry, ...this.derivedAcAdjustments(char, adjustmentMapEntry)]) {
              this.trackAdjustment(char, entry);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  update(update: Partial<Character> = {}) {
    console.log('updating character update:', update)
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

    const featureIndex = objdestination.findIndex(byId(feature.id));
    if (featureIndex === -1) objdestination.push(feature);
    else objdestination.splice(featureIndex, 1, feature);

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
