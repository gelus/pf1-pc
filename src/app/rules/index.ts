import {RuleModule} from './rule-module';
import {abilityDamageRule} from './ability-damage';
import {classProgressionModule} from './class-progression';
import {sizeRule} from './size.rule';
import {defensesRule} from './defenses';
import {damageTakenRule} from './damage-taken';
import {languagesRule} from './languages';
import {defensiveCombatRule} from './defensive-combat';
import {armorProficiencyRule} from './armor-proficiency';
import {attacksRule} from './attacks';
import {spellcastingRule} from './spellcasting';
import {favoredClassRule} from './favored-class.rule';
import {movementRule} from './movement.rule';
import {familiarRule} from './familiar.rule';
import {animalCompanionRule} from './animal-companion.rule';
import {eidolonRule} from './eidolon.rule';

// every rule module the engine runs, in this order. each module lives in a file of its own in this folder
// add a module with a single line here, one module per line keeps parallel work from conflicting
// damage taken comes last: its finalize reads the final max hp
export const RULE_MODULES: RuleModule[] = [
  abilityDamageRule,
  classProgressionModule,
  favoredClassRule,
  familiarRule,
  animalCompanionRule,
  eidolonRule,
  sizeRule,
  movementRule,
  defensesRule,
  languagesRule,
  defensiveCombatRule,
  armorProficiencyRule,
  attacksRule,
  spellcastingRule,
  damageTakenRule,
];
