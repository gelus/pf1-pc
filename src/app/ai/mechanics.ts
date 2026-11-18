import {Feature} from '../interfaces/character.interface';

// what the builders hold the AI to when it writes a feature: the rules of a feature become adjustments, so the
// sheet works them out, instead of staying in the description where nothing applies them. a feature that changes no
// number says so (descriptionOnly, with why), the rest is refused. a class feature does not show on the sheet by
// itself: what the player reads and uses goes in an entry it gives (specialAttack, defensiveAbilities,
// specialQuality), and a feature the player turns on and off (studied target, a stance, rage) has its toggle and
// its bonuses on that entry, where the sheet shows the checkbox

// where a feature shows on the sheet, and what goes there
export const DISPLAY_LISTS = ['specialAttack', 'defensiveAbilities', 'specialQuality'] as const;
const DISPLAY_GUIDE = 'specialAttack for what it does in a fight (sneak attack, studied target, smite, rage), '
  + 'defensiveAbilities for what protects it (evasion, uncanny dodge, trap sense), specialQuality for the rest (track, '
  + 'wild empathy, darkvision)';

// adjustments the sheet keeps count of without showing them as a feature: a bonus feat, skill ranks, proficiencies
const BOOKKEEPING = /^(bonusFeats|bonusSkillRanks|proficiencies\.|classSkills|languages|favoredClass)/;

// how a feature's rules become adjustments, for the AI: given with every refusal, so the next try fixes it
export const MECHANICS_GUIDE = [
  'Write every number the rules give as adjustments: an always-on bonus as the path ("saves.will": 1), one that '
    + 'applies only in a situation the sheet can not know of as a variant ("skills.survival.value[follow tracks]"), '
    + 'and one the player turns on (while studying a target, in a stance, raging) on a feature with "active": false, '
    + 'so the sheet shows a checkbox and the bonuses while it is on.',
  'A bonus that grows with the class level is a formula of it, "1+floor({level.slayer}/5)", never a fixed number.',
  `A class feature shows on the sheet through the entry it gives: ${DISPLAY_GUIDE}. The toggle ("active") and the `
    + 'bonuses go on that entry: {"name": "Studied Target", "adjustments": {"specialAttack": {"name": "Studied Target", '
    + '"description": "move action, +1 attack and damage, Bluff, Knowledge, Perception, Sense Motive, Survival vs. the '
    + 'target", "active": false, "adjustments": {"melee.*.toHitBonus": "1+floor({level.slayer}/5)", ...}}}}.',
  'Only a feature that changes no number (a proficiency the class already gives, a rule that is judged at the table) '
    + 'is description only: give it "descriptionOnly": "why".',
].join(' ');

const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const entriesGiven = (feature: Feature): {[key: string]: unknown}[] => DISPLAY_LISTS.flatMap(list => {
  const given = (feature.adjustments as {[path: string]: unknown} | undefined)?.[list];
  return (Array.isArray(given) ? given : [given]).filter(isObject);
});

// what is wrong with how the features were written, undefined when nothing is. features are what the AI gave, with
// descriptionOnly still on them: strip it with withoutMarks before keeping them. class features are checked for
// where they show and where their toggle is too
export const mechanicsProblems = (
  features: Feature[], options: {classFeatures?: boolean} = {},
): string[] => {
  const problems: string[] = [];
  for (const feature of features) {
    const name = feature.name || 'a feature';
    const reason = (feature as {descriptionOnly?: unknown}).descriptionOnly;
    const paths = Object.keys(feature.adjustments || {});
    if (!paths.length) {
      if (typeof reason !== 'string' || !reason.trim()) {
        problems.push(`${name} adjusts nothing: write its rules as adjustments, or give "descriptionOnly": "why" if it changes no number`);
      }
      continue;
    }
    if (!options.classFeatures) continue;
    if (feature.active !== undefined) {
      problems.push(`${name}: a class feature does not show on the sheet, its toggle would hide it. Put "active" and the bonuses it turns on in the entry it gives (specialAttack, defensiveAbilities or specialQuality)`);
    }
    const shown = entriesGiven(feature).length > 0;
    const onlyBookkeeping = paths.every(path => BOOKKEEPING.test(path));
    if (!shown && !onlyBookkeeping) {
      problems.push(`${name} does not show on the sheet: give it an entry, ${DISPLAY_GUIDE}`);
    }
    for (const entry of entriesGiven(feature)) {
      if (entry['active'] !== undefined && typeof entry['active'] !== 'boolean') problems.push(`${name}: active is true or false`);
    }
  }
  return problems;
};

// the features as they are kept: without the marks only the check reads
export const withoutMarks = (features: Feature[]): Feature[] => features.map(feature => {
  const {descriptionOnly, ...kept} = feature as Feature & {descriptionOnly?: unknown};
  return new Feature(kept);
});

// the refusal, with how to fix it
export const mechanicsRefusal = (problems: string[]): {error: string, problems: string[], how: string} => ({
  error: 'nothing was changed: the features need their rules as adjustments, fix these and call again',
  problems,
  how: MECHANICS_GUIDE,
});
