import { Pipe, PipeTransform } from '@angular/core';
import {Character} from '../utils/character.class';
import {abilityModifier} from '../ability-mod.pipe';
import {isSkillFamily} from '../utils/skilllist.class';
import {favoredClassBonuses} from '../rules/class-progression';

// the skill ranks the character has (each level's skill ranks + its Int modifier, at least 1, and favored class
// ranks) and those it spent on its skills
export const skillRankBudget = (character: Character): {available: number, spent: number} => {
    const intMod = abilityModifier(character, 'int');
    let available = 0;
    let spent = 0;
    for (const classLevel of character.classLevels || []) {
      // each entry is one character level, see ClassLevel
      available += Math.max(classLevel.skillRanks + intMod, 1);
    }
    // a level in a favored class can give an extra skill rank instead of an extra hit point
    available += favoredClassBonuses(character, 'skill');
    // ranks features give on top (a human's Skilled)
    available += Math.max(0, Math.floor(Number(character.bonusSkillRanks) || 0));
    for (const [key, skill] of Object.entries(character.skills || {})) {
      if (isSkillFamily(key)) {
        for (const subSkill of Object.values(skill.subSkills || {})) {
          spent += subSkill.ranks || 0;
        }
      } else {
        spent += skill.ranks || 0;
      }
    }
    return {available, spent};
};

@Pipe({
  name: 'remainingRanks'
})
export class RemainingRanksPipe implements PipeTransform {

  transform(character: Character): unknown {
    const {available, spent} = skillRankBudget(character);
    return `${available - spent}/${available}`;
  }

}
