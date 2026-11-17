import {sizes} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {assignByPath, evaluateVal} from '../utils/object.util';
import {
  FLY_SIZE_MODIFIER,
  SIZE_MODIFIER,
  SPECIAL_SIZE_MODIFIER,
  STEALTH_SIZE_MODIFIER,
  clampSize,
} from '../utils/size.util';
import {RuleContext, RuleModule, ruleFeature} from './rule-module';

// the stats the size modifiers adjust, touch and flat-footed ac take theirs from the ac
export const SIZE_MODIFIED_PATHS = [
  'ac', 'touchAc', 'flatFootedAc', 'attackRollBonus', 'cmb', 'cmd', 'skills.fly.value', 'skills.stealth.value',
];

// pf1 has no size bonus to those stats besides the size modifier, and this rule gives that one from the final size.
// so any other size-typed adjustment of them is stale (a +1 written in for a small race, the character enlarged to
// large since) or the same modifier given twice: the rule owns the size type on those paths and crosses the others
// out. the engine already applied them by then (a larger one even won over a smaller one), so this undoes their value
// on the applied character directly and frees the type for the rule's own modifier. a medium character, which gets
// no size modifier, has the stale ones crossed out all the same
// - only adjustments that add are undone: sets and bounds were resolved with the size modifier included, and a
//   variant (a conditional bonus) is not part of the value. those are left as they are
// - a formula is undone with what it is worth now, at the end of the character
// - an untyped modifier written in for the size cannot be told apart from any other untyped modifier, it is left alone
// - size bonuses to other stats (enlarge person's +2 size bonus to strength) are legitimate and left alone
const removeStaleSizeAdjustments = (applied: Character, context: RuleContext): void => {
  for (const path of SIZE_MODIFIED_PATHS) {
    const entries = context.adjustmentsMap[path];
    if (!entries) continue;
    for (const entry of entries) {
      if ((entry.type || '').toLowerCase() !== 'size' || entry.variant !== undefined || entry.mode) continue;
      if (!entry.overwritten) {
        const value = typeof entry.value === 'number' ? entry.value : evaluateVal(entry.value, applied);
        if (!Number.isNaN(value)) assignByPath(applied, path, -value);
        entry.overwritten = true;
      }
    }
    // the engine keeps the size adjustment applied to the stat under its type, so it would weigh the rule's against it
    for (const key of Object.getOwnPropertyNames(entries)) {
      if (key.toLowerCase() === 'size') delete (entries as any)[key];
    }
  }
};

// the modifiers of the final size of the character (enlarge person and the like included), see size.util
//  size modifier: AC (touch and flat-footed AC too) and attack rolls
//  special size modifier: CMB and CMD
//  and the size modifiers of fly and stealth
// they are all of the size type, and always apply: any other size-typed adjustment of those stats is crossed out,
// see removeStaleSizeAdjustments. a medium character has none of them
export const sizeRule: RuleModule = {
  name: 'size',
  final: (_raw, applied, context) => {
    removeStaleSizeAdjustments(applied, context);
    const size = clampSize(applied.size);
    if (!SIZE_MODIFIER[size]) return [];
    const modifier = (value: number) => ({value, type: 'size'});
    return [ruleFeature(`Size (${sizes[size]})`, {
      ac: modifier(SIZE_MODIFIER[size]),
      attackRollBonus: modifier(SIZE_MODIFIER[size]),
      cmb: modifier(SPECIAL_SIZE_MODIFIER[size]),
      cmd: modifier(SPECIAL_SIZE_MODIFIER[size]),
      'skills.fly.value': modifier(FLY_SIZE_MODIFIER[size]),
      'skills.stealth.value': modifier(STEALTH_SIZE_MODIFIER[size]),
    })];
  },
};
