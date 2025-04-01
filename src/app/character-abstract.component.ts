import { Component, Signal, WritableSignal, computed, effect } from '@angular/core';
import {Character} from './utils/character.class';
import {Feature} from './interfaces/character.interface';
import {assingByPath, getByPath} from './utils/object.util';
import {ls} from './utils/localstorage.util';
import { AbilityModPipe } from './ability-mod.pipe';
import {Item} from './utils/item.class';


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

  appliedCharacter: Signal<Character> = computed(() => {
    const character = this.character();
    console.log('Raw Character', character);
    const appliedChar = JSON.parse(JSON.stringify(this.character()));

    // apply classLevel
    for (const [ind, classLevel] of character.classLevels.entries()) {
      // assign HP level
      appliedChar.hp += (ind === 0 ? classLevel.hitDice : classLevel.rolledHp);
      // assign class skills
      for (const skillName of classLevel.classSkills) {
        appliedChar.skills[skillName].classSkill = true;
      }
    }

    // apply features from feature Lists
    for(const location of this.featureListLocations) {
      this.applyFeatureList(appliedChar, getByPath(appliedChar ,location));
    }

    // assign mod dependant things after features have been processed
    appliedChar.hp += AbilityModPipe.algorithm(appliedChar.abilityScores.con) * character.classLevels.length

    return appliedChar;
  });

  saveOnUpdate: boolean = false; // A flag that dictates weather or not a character should be saved when it is updated

  constructor() {
    if (this.saveOnUpdate) {
      effect(() => {
        const char = this.character();
        console.log('saving character', char);
        ls.setItem('character-'+char.id, char);
      });
    }
  }

  applyFeatureList(char: Character, featureList: Feature[]) {
    for (const feature of featureList) {
      for (const [adjusting, adjustment] of Object.entries(feature.adjustments)) {
        assingByPath(char, adjusting, adjustment);
      }
    }
  }

  updateCharacter(update: Partial<Character> = {}) {
    console.log('updating character', update)
    this.character.update((char: Character) => ({...char, ...update}));
  }

  consumeFeature({feature, destination}:{feature: Feature|Item, destination: string}) {
    const objdestination = getByPath(this.character(), destination as string);

    if (!objdestination.includes(feature)) objdestination.push(feature);

    this.updateCharacter();
  }

  removeFeature<Item>(list: Item[], feature: Item): void;
  removeFeature<Feature>(list: Feature[], feature: Feature): void;
  removeFeature<Ltype>(list: Ltype[], feature: Ltype): void {
    list.splice(list.indexOf(feature), 1);
    this.updateCharacter();
  }
}
