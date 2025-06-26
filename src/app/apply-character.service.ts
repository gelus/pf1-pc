import { Injectable, Signal, WritableSignal, computed, effect, signal } from '@angular/core';
import {Character} from './utils/character.class';
import {ls} from './utils/localstorage.util';
import {Feature} from './interfaces/character.interface';
import {assignByPath, getByPath} from './utils/object.util';
import {Item} from './utils/item.class';
import {AbilityModPipe} from './ability-mod.pipe';

const byId = (id: string) => (f: any): boolean => f.id === id;

@Injectable({
  providedIn: 'root'
})
export class ApplyCharacterService {

  public featureListLocations = ['race.features', 'conditions', 'feats', 'specialAttack' ]

  public adjustmentsMap: {[key: string]: any} = {};
  public raw: WritableSignal<Character> = signal(new Character());

  public applied: Signal<Character> = computed(() => {
    const character = this.raw();
    this.adjustmentsMap = {};
    const appliedChar = JSON.parse(JSON.stringify(character));

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
    this.applyFeatureList(appliedChar, character.inventory.reduce((cur, item): Feature[] => {
      if (item.equipped) return [...cur, ...item.features];
      else return cur;
    }, [] as Feature[]))

    // assign mod dependant things after features have been processed
    appliedChar.hp += AbilityModPipe.algorithm(appliedChar.abilityScores.con) * character.classLevels.length

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

  applyFeatureList(char: Character, featureList: Feature[]) {
    for (const feature of featureList) {
      if (feature.active === false) continue;
      try {
        if (feature.adjustments) {
          for (const [adjusting, adjustment] of Object.entries(feature.adjustments)) {
            if (!this.adjustmentsMap[adjusting]) this.adjustmentsMap[adjusting] = [];
            this.adjustmentsMap[adjusting].push({
              origin: feature.name,
              value: adjustment.value || adjustment,
              type: adjustment.type || ''
            })
            assignByPath(char, adjusting, adjustment);
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

