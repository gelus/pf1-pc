import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {armorProficiencyFor, isShield, itemAdds, shieldCategoryOf} from '../utils/equipment.util';
import {RuleModule, ruleFeature} from './rule-module';

// Pathfinder 1e armor and shield proficiency, Core Rulebook, Equipment (Armor) and Feats
//  Armor Proficiency (light, medium, heavy), Normal: "A character who is wearing armor with which he is not proficient
//  applies its armor check penalty to attack rolls and to all skill checks that involve moving, including Ride."
//  Shield Proficiency, Normal: "When you are using a shield with which you are not proficient, you take the shield's
//  armor check penalty on attack rolls and on all skill checks that involve moving, including Ride."
//  Tower Shield Proficiency, Normal: the same for a tower shield
//  Tower shield: "In addition, you take a –2 penalty on attack rolls when using a tower shield because of its
//  encumbrance." whatever the proficiency
//
// the check penalty of armor and shields already applies to every Str and Dex based skill (the ones that involve
// moving, Ride included, see SkillValuePipe), so a nonproficient item adds its penalty to the attack rolls only:
// adding it to those skills again would count it twice
//
// worked out in the final hook, once the character holds every proficiency its classes and feats gave it. the
// penalty is the item's own check penalty (its features, without the caps of a load or the floors of armor training)

const proficient = (applied: Character, proficiency: string): boolean =>
  (applied.proficiencies?.armor || []).some(name => String(name).trim().toLowerCase() === proficiency);

export const armorProficiencyRule: RuleModule = {
  name: 'armor proficiency',
  final: (_raw, applied) => {
    const features: Feature[] = [];
    for (const item of applied.inventory || []) {
      if (!item?.equipped || item.carried === false) continue;
      const proficiency = armorProficiencyFor(item);
      if (!proficiency) continue;
      const name = item.name || (isShield(item) ? 'Shield' : 'Armor');
      const penalty = itemAdds(item, 'armorCheckPenalty');
      if (!proficient(applied, proficiency) && penalty < 0) {
        features.push(ruleFeature(`Nonproficient: ${name}`, {attackRollBonus: penalty}));
      }
      if (isShield(item) && shieldCategoryOf(item) === 'tower') {
        features.push(ruleFeature(`Tower Shield: ${name}`, {attackRollBonus: -2}));
      }
    }
    return features;
  },
};
