import { Component, Signal, WritableSignal, computed, effect } from '@angular/core';
import {Character} from './utils/character.class';
import {Feature} from './interfaces/character.interface';
import {assignByPath, getByPath} from './utils/object.util';
import {ls} from './utils/localstorage.util';
import { AbilityModPipe } from './ability-mod.pipe';
import {Item} from './utils/item.class';


const byId = (id: string) => (f: any): boolean => f.id === id;

// The idea with this abstract class is to wrap the character update flow into
// its own file, so it can be reused between pages that need it ( new-character/charactersheet)
// this also isolatses the areas of concern

@Component({
  imports: [],
  template: '',
})
export abstract class CharacterAbstractComponent {

  featureListLocations = ['race.features', 'conditions', 'feats', ]

  abstract character: WritableSignal<Character>;
  protected characterAdjustments: {[key: string]: any} = {};

  appliedCharacter: Signal<Character> = computed(() => {
    const character = this.character();
    this.characterAdjustments = {};
    const appliedChar = JSON.parse(JSON.stringify(this.character()));

    // apply classLevel
    for (const [ind, classLevel] of character.classLevels.entries()) {
      // assign HP level
      appliedChar.hp += (ind === 0 ? classLevel.hitDice : classLevel.rolledHp);
      // assign class skills
      for (const skillName of classLevel.classSkills) {
        appliedChar.skills[skillName].classSkill = true;
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

  saveOnUpdate: boolean = false;

  constructor() {
    effect(() => {
      if (!this.saveOnUpdate) return;
      const rawChar = this.character();
      console.log('Saving Raw Character', rawChar);
      ls.setItem('character-'+rawChar.id, rawChar);
    });
  }

  applyFeatureList(char: Character, featureList: Feature[]) {
    for (const feature of featureList) {
      try {
        for (const [adjusting, adjustment] of Object.entries(feature.adjustments)) {
        if (!this.characterAdjustments[adjusting]) this.characterAdjustments[adjusting] = [];
          this.characterAdjustments[adjusting].push({
            origin: feature.name,
            value: adjustment.value || adjustment,
            type: adjustment.type || ''
          })
          assignByPath(char, adjusting, adjustment);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  updateCharacter(update: Partial<Character> = {}) {
    console.log('updating character update:', update)
    this.character.update((char: Character) => ({...char, ...update}));
  }

  consumeFeature({feature, destination}:{feature: Feature|Item, destination: string}) {
    const objdestination = getByPath(this.character(), destination as string);

    const featureIndex = objdestination.findIndex(byId(feature.id));
    if (featureIndex === -1) objdestination.push(feature);
    else objdestination.splice(featureIndex, 1, feature);

    this.updateCharacter();
  }

  removeFeature<Item>(list: Item[], feature: Item): void;
  removeFeature<Feature>(list: Feature[], feature: Feature): void;
  removeFeature<Ltype extends {id: string}>(list: Ltype[], feature: Ltype): void {
    const featureIndex = list.findIndex(byId(feature.id));
    list.splice(featureIndex, 1);
    this.updateCharacter();
  }
}
