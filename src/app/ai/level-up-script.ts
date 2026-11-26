import type {CreationStep} from './creation-script';
import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {availableFeats, pendingAbilityIncreases} from '../rules/class-progression';
import {characterLevel} from '../utils/classlevel.class';
import {CLASS_FEATURE_RECIPE} from './mechanics';
import {spellsToDo} from './level-up';

// the script of leveling a character up with the AI, one character level at a time, run by the same steps as its
// creation (creation-script.ts): each step's questions asked, its changes held until the player answered, its
// requirements checked as it completes, and the whole character checked before the level up ends
// (checkLeveledCharacter). the steps are those of the Core Rulebook's "Advancing Your Character": the class level (its
// hit die, favored class bonus and class features), an ability increase on every 4th level, skill ranks, a feat on
// every odd level, new spells

const SKILLS = 'acrobatics|appraise|bluff|climb|craft|diplomacy|disable device|disguise|escape artist|fly|handle animal|'
  + 'heal|intimidate|knowledge|linguistics|perception|perform|profession|ride|sense motive|sleight of hand|spellcraft|'
  + 'stealth|survival|swim|use magic device';
const ABILITY_WORDS = /\b(str(ength)?|dex(terity)?|con(stitution)?|int(elligence)?|wis(dom)?|cha(risma)?)\b/i;

// the level the level up started at, and the class level it added (the new character level's entry)
const fromLevel = (service: ApplyCharacterService): number => service.raw().levelUp?.fromLevel ?? characterLevel(service.raw());
const added = (service: ApplyCharacterService) => {
  const raw = service.raw();
  return characterLevel(raw) > fromLevel(service) ? raw.classLevels[raw.classLevels.length - 1] : undefined;
};
// the casters with something to add since the level (a spontaneous caster's new spell known, a new spell level)
const castersToDo = (service: ApplyCharacterService): string[] =>
  Object.keys(service.applied().spells || {}).filter(origin => spellsToDo(service, origin).length);

export const LEVEL_UP_STEPS: CreationStep[] = [
  {
    id: 'level-class',
    title: 'Class level',
    ask: [
      'Which class does the new level go in? (the one they have, or a new one: suggest what fits)',
      'What did you roll on the hit die (or does the table take the average)?',
      'For a level in the favored class: +1 hit point, +1 skill rank, or an alternate bonus of the race?',
    ],
    guide: 'get_level_up_status says what the level gets. A class of the app\'s library (look_up_rules answers from it): '
      + 'add_class_level library_id builds the row as the library has it (its archetypes\' trades made), with the hit die '
      + 'rolled, the favored class bonus, the ability increase, choices for what the row names, and in features only a '
      + 'pick the row leaves to the player that the library doesn\'t hold (a rage power, a talent). Any other class: '
      + 'look the class up (kind class, focus on that level of its '
      + 'table) and add_class_level with every class feature of that row, the hit die the player rolled, the favored '
      + 'class bonus and, on a 4th level, the ability increase when the player said it. A choice the row gives (a rage '
      + 'power, a talent, a bonus feat, a revelation) is the player\'s: ask, then look it up. An archetype of the class '
      + 'leaves out what it replaced (get_level_up_status, archetypes): its feature of the row comes in its place. A new '
      + 'class can take an archetype at its 1st level (archetypes). A prestige class: its requirements at its 1st level '
      + '(requirements, as its page lists them: the app checks them), and on each level its table gives "+1 level of '
      + 'existing spellcasting class", advances_casting with the class it advances (the player picks when there are two). '
      + 'A class feature picked for again (a fighter\'s weapon training group, a ranger\'s favored enemy and terrain) takes the level\'s pick, the player\'s: add_class_level picks {"Favored Enemy": {"pick": "undead"}} (with "raise" naming the pick a later level raises). '
      + 'A class feature with a fixed number that grows at this level '
      + '(add_class_level lists them) is changed with edit_feature. ' + CLASS_FEATURE_RECIPE,
    tools: ['add_class_level', 'set_favored_class_bonus'],
    completesWith: ['add_class_level'],
    answeredEarly: /\b(rolled|roll(ed)? an? \d+|\d+ on the (die|d\d+)|(take|takes|taking) the average|average hp|level (in|of) [a-z]+)\b/i,
    missing: service => added(service) ? undefined : 'add the class level (add_class_level)',
    checks: 'class',
  },
  {
    id: 'level-ability',
    title: 'Ability increase',
    ask: ['Which ability score goes up by 1? (suggest the one the class and concept lean on)'],
    guide: 'Every 4th character level raises one ability score by 1: choose_ability_increase with the one the player '
      + 'picked. Say what it changes (a modifier that goes up, bonus spells).',
    tools: ['choose_ability_increase'],
    completesWith: ['choose_ability_increase'],
    answeredEarly: ABILITY_WORDS,
    skip: service => !pendingAbilityIncreases(service.raw()),
    missing: service => pendingAbilityIncreases(service.raw()) ? 'pick the ability that goes up (choose_ability_increase)' : undefined,
    checks: 'level',
  },
  {
    id: 'level-skills',
    title: 'Skill ranks',
    ask: ['Where do the new skill ranks go? (say how many, and suggest skills that fit)'],
    guide: 'get_level_up_status says the ranks left and the most per skill (the character level). A rank costs one '
      + 'point, class skill or not, and a class skill with a rank gets +3. Never suggest a skill at its most ranks. '
      + 'set_skill_ranks with the ranks each skill has in all (what it had plus the new ones).',
    tools: ['set_skill_ranks'],
    completesWith: ['set_skill_ranks'],
    answeredEarly: new RegExp(`\\b(${SKILLS})\\b`, 'i'),
    skip: service => {
      const {available, spent} = skillRankBudget(service.applied());
      return available <= spent;
    },
    missing: service => {
      const {available, spent} = skillRankBudget(service.applied());
      return available > spent ? `${available - spent} skill ranks are left to spend` : undefined;
    },
    checks: 'skills',
  },
  {
    id: 'level-feats',
    title: 'Feat',
    ask: ['Which feat? (suggest a few the character qualifies for now that fit how it plays)'],
    guide: 'An odd character level gives a feat, and a class feature can give a bonus feat. Suggest from what you know, '
      + 'without looking anything up; look up only the feat the player picks and add it with create_feature in feats, '
      + 'with its prerequisites (the app checks them). A bonus with one weapon is "melee.@<weapon>.toHitBonus".',
    tools: ['create_feature'],
    completesWith: ['create_feature'],
    answeredEarly: /\bfeats?\b/i,
    skip: service => availableFeats(service.applied()) <= (service.applied().feats || []).length,
    missing: service => {
      const applied = service.applied();
      const left = availableFeats(applied) - (applied.feats || []).length;
      return left > 0 ? `${left} feat${left > 1 ? 's are' : ' is'} left to pick` : undefined;
    },
    checks: 'feats',
  },
  {
    id: 'level-spells',
    title: 'Spells',
    ask: ['Which new spells does the character learn (or add to its book)? (say how many, and suggest some)'],
    guide: 'get_character_summary shows each caster: what it casts a day and knows. A spontaneous caster learns what '
      + 'its table adds, and at some levels may swap a spell it knows (remove_spells, then add_spells); a class page '
      + 'says what a level adds to a spellbook (a wizard: two spells of any level it can cast). Suggest from what you '
      + 'know; look up only the spells the player picks, in one look_up_rules call, and add them with add_spells '
      + '(a spell of the library, as look_up_rules answers from it: add_spells library_ids, its effect with it).',
    tools: ['add_spells', 'prepare_spells', 'remove_spells', 'set_caster_choices'],
    completesWith: ['add_spells'],
    answeredEarly: /\b(spells?|cantrips?|orisons?)\b/i,
    // a caster that leveled, or one with something to add since
    skip: service => !added(service)?.spellcasting && !castersToDo(service).length,
    missing: service => {
      const todo = castersToDo(service).flatMap(origin => spellsToDo(service, origin));
      return todo.length ? todo.join('; ') : undefined;
    },
    checks: 'spells',
  },
  {
    id: 'level-review',
    title: 'Review',
    ask: ['Here is the character at its new level: anything to change?'],
    guide: 'The level up is done: read get_character_summary and show what changed (hit points, attacks, saves, new '
      + 'features), from it, never your own numbers, and ask if anything should change. The character\'s companions '
      + '(get_character_summary lists them) may advance with it: say so, each is leveled on its own sheet.',
    tools: [],
    ends: true,
  },
];
