import { Injectable, Signal, WritableSignal, computed, effect, signal } from '@angular/core';
import {Character} from './utils/character.class';
import {ls} from './utils/localstorage.util';
import {Feature, flatFootedAcIgnoredBonusTypes, touchAcIgnoredBonusTypes} from './interfaces/character.interface';
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

// adjustment values are usually numbers or calculated strings, anything else (an attack, a skill, ...) does not total up
const asNumber = (value: any, char: Character): number =>
  typeof value === 'number' || typeof value === 'string' ? evaluateVal(value, char) || 0 : 0;

// the breakdown of the derived ACs, kept alongside the adjustmentsMap so the sheet can display where the numbers came from
export interface AcBreakdown {
  dex: number;
  touchIgnored: number;
  flatFootedDex: number;
  flatFootedIgnored: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApplyCharacterService {

  public featureListLocations = ['race.features', 'conditions', 'feats', 'specialAttack' ]

  public adjustmentsMap: {[key: string]: AdjustmentMapArray} = {};
  public acBreakdown: AcBreakdown = {dex: 0, touchIgnored: 0, flatFootedDex: 0, flatFootedIgnored: 0};
  private postAdjustments: AdjustmentMapArray = [] as unknown as AdjustmentMapArray;
  public raw: WritableSignal<Character> = signal(new Character());

  public applied: Signal<Character> = computed(() => {
    const character = this.raw();
    this.adjustmentsMap = {};
    this.acBreakdown = {dex: 0, touchIgnored: 0, flatFootedDex: 0, flatFootedIgnored: 0};
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

    this.applyDerivedAc(appliedChar);

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
    this.saveOnUpdate = saveOnUpdate;
    this.raw.set(character);
  }

  assignToChar(char: Character, adjustmentMapEntry:AdjustmentMapEntry) {
    if (adjustmentMapEntry.type && !['ranged', 'melee'].includes(adjustmentMapEntry.adjusting)) {
      const appliedTypeBonus = this.adjustmentsMap[adjustmentMapEntry.adjusting][adjustmentMapEntry.type];
      if (appliedTypeBonus && evaluateVal(adjustmentMapEntry.value, char) < evaluateVal(appliedTypeBonus.value, char)) {
        adjustmentMapEntry.overwritten = true;
        return;
      }
      this.adjustmentsMap[adjustmentMapEntry.adjusting][adjustmentMapEntry.type] = adjustmentMapEntry;
    }
    assignByPath(char, adjustmentMapEntry.adjusting, adjustmentMapEntry.value);
  }

  // totals the ac adjustments of the given bonus types that actually made it onto the character
  acBonusTotal(char: Character, bonusTypes: string[]): number {
    const adjustments: AdjustmentMapEntry[] = this.adjustmentsMap['ac'] ?? [];
    return adjustments.reduce((total, adjustment) => (
      adjustment.overwritten || !bonusTypes.includes((adjustment.type || '').toLowerCase())
        ? total
        : total + asNumber(adjustment.value, char)
    ), 0);
  }

  // touch ac drops armor, shield and natural armor bonuses, everything else (dex, size, deflection, ...) applies normally
  // flat-footed ac drops dodge bonuses and any positive dex bonus, a negative dex modifier still applies
  applyDerivedAc(char: Character) {
    const ac = asNumber(char.ac, char);
    const dex = AbilityModPipe.algorithm(char.abilityScores.dex, char.maxDexBonus || Infinity);

    this.acBreakdown = {
      dex,
      touchIgnored: this.acBonusTotal(char, touchAcIgnoredBonusTypes),
      flatFootedDex: Math.min(dex, 0),
      flatFootedIgnored: this.acBonusTotal(char, flatFootedAcIgnoredBonusTypes),
    };

    char.touchAc += ac + this.acBreakdown.dex - this.acBreakdown.touchIgnored;
    char.flatFootedAc += ac + this.acBreakdown.flatFootedDex - this.acBreakdown.flatFootedIgnored;
  }

  applyFeatureList(char: Character, featureList: Feature[]) {
    for (const feature of featureList) {
      if (feature.active === false) continue;
      try {
        if (feature.adjustments) {
          for (const [adjusting, adjustment] of Object.entries(feature.adjustments)) {
            if (!this.adjustmentsMap[adjusting]) this.adjustmentsMap[adjusting] = [] as unknown as AdjustmentMapArray;
            const adjustmentMapEntry: AdjustmentMapEntry = {
              adjusting,
              origin: feature.name || '',
              // `?? `, not `||`, so a typed adjustment worth 0 keeps its value instead of falling back to the whole object
              value: adjustment?.value ?? adjustment,
              type: adjustment?.type || '',
              overwritten: false,
            };
            this.adjustmentsMap[adjusting].push(adjustmentMapEntry);
            if (/{(mod|stat):/.test(adjustmentMapEntry.value) || /\.\*\./.test(adjusting)) this.postAdjustments.push(adjustmentMapEntry)
            else this.assignToChar(char, adjustmentMapEntry);
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

