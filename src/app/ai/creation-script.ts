import {companionLine, companionWarnings} from '../rules/companions';
import {eidolonWarnings} from '../rules/eidolon.rule';
import {COMPANION_STEPS, CompanionScript, companionScriptOf} from './companion-scripts';
import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {ABILITIES, availableFeats, pendingAbilityIncreases} from '../rules/class-progression';
import {Character, CreationProgress} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';
import {POINT_BUY_COST, pointBuyTotal, tableRollsScores} from './creation';
import {POINT_BUY_MAX, POINT_BUY_MIN} from '../rules/point-buy';
import {parseJsonArg} from './json-arg';
import {checkCreatedCharacter, checkCreationStep, checkLeveledCharacter, stepRequirements} from './character-check';
import {LEVEL_UP_STEPS} from './level-up-script';
import {levelUpAvailable, nextLevelXp, xpForLevel} from '../rules/experience';
import {startingLevelOf} from '../rules/starting-wealth';
import {CLASS_FEATURE_RECIPE} from './mechanics';
import {RemainingStartingWealthPipe} from '../characterPipes/remaining-starting-wealth.pipe';
import {copperToPurse, purseToCopper} from '../utils/wealth.util';
import {Purse} from '../utils/item.class';
import {ActionResult} from './play-actions';

// the script of creating a character with the AI, the steps of the Core Rulebook (d20pfsrd, character creation):
// ability scores, race, class, skills, feats, then the rest. each step has the questions the AI asks, how it helps,
// the tools that make its changes and what must be true before it is done. the AI asks a step's questions, the
// player answers, the AI makes the changes and completes the step with what was decided, which the next steps read
// to suggest from. the app holds the AI to it: a step's changes are refused until the player answered its questions
// (see creationGate), or until the AI quotes the player's own words answering it (an answer given before the step was
// asked), and a step is not done until what it needs is there

export interface CreationStep {
  id: string;
  title: string;
  // what the AI asks the player at this step
  ask: string[];
  // how the AI helps with the step: what to suggest, what to look up, the tools to use
  guide: string;
  // the tools that change the character at this step
  tools: string[];
  // what is missing before the step is done, undefined once it is
  missing?: (service: ApplyCharacterService) => string | undefined;
  // a step that does not apply to the character (spells for a character that casts none)
  skip?: (service: ApplyCharacterService) => boolean;
  // the player's messages so far answer it (the first message that asked for a character often says its concept)
  answeredSoFar?: boolean;
  // what the sheet already has for the step, filled in before the creation started (scores typed in, a race
  // picked): the creation goes past the step with that as its decision. undefined when the step is still open
  onSheet?: (service: ApplyCharacterService) => string | undefined;
  // what the player's words look like when they answer this step before it was asked (a race named, six scores):
  // the AI quoting them makes its changes without asking again. a step without it is always asked (its choices are
  // the player's to make once they see the suggestions: feats, gear)
  answeredEarly?: RegExp;
  // the changes that finish the step once what it needs is there: the app completes it then, the AI need not (it
  // forgot to, and the creation stayed at the step)
  completesWith?: string[];
  // its answers are told apart from any other step's (a race named, the name and alignment): a message with one of
  // them answers this step, not the one the creation is at
  tellsApart?: boolean;
  // the steps whose requirements (character-check.ts) it is checked by, when not its own id (a level up's skills
  // step is checked as the creation's skills)
  checks?: string | string[];
  // the last step: reaching it ends the script, once the app's check of the whole character passes
  ends?: boolean;
}

const NO_TRAITS = /\bno traits?\b|\btraits?\b[^.]{0,20}\b(no|none|not)\b|\b(don'?t|do not|doesn'?t|does not|not|without)\b[^.]{0,20}\btraits?\b/i;

const SKILLS = 'acrobatics|appraise|bluff|climb|craft|diplomacy|disable device|disguise|escape artist|fly|handle animal|'
  + 'heal|intimidate|knowledge|linguistics|perception|perform|profession|ride|sense motive|sleight of hand|spellcraft|'
  + 'stealth|survival|swim|use magic device';
const RACES = 'dwarf|elf|elven|gnome|half-?elf|halfling|half-?orc|human|aasimar|tiefling|catfolk|goblin|hobgoblin|'
  + 'kobold|orc|ratfolk|tengu|kitsune|nagaji|oread|ifrit|sylph|undine|dhampir|fetchling|samsaran|vanara|vishkanya|'
  + 'wayang|changeling|duergar|drow|gillman|grippli|merfolk|strix|suli|svirfneblin|wyvaran';

const named = (features?: {name?: string}[]): string => (features || []).map(f => f.name).filter(Boolean).join(', ');

const EDITS = ['edit_feature', 'remove_feature', 'edit_item', 'remove_item'];

export const CREATION_STEPS: CreationStep[] = [
  {
    id: 'concept',
    title: 'The concept',
    ask: [
      'What character do you want to play: their idea, their role in the party, how they fight or help?',
      'How does your table make ability scores: a point buy (10 low, 15 standard, 20 high, 25 epic fantasy) or rolled (4d6, drop the lowest)?',
      'Does your table use traits, and anything else to know (third-party content, rolled or average starting gold)?',
      'What level does the character start at (1st unless the GM says otherwise)?',
    ],
    guide: 'Skip any question the player already answered. Complete this step with their answers, right away when they '
      + 'already gave them. A character made above 1st level: set_character_details starting_level first (its 1st '
      + 'level is built as usual, its other levels at the higher levels step, its gear bought with the wealth of its level).',
    tools: ['set_character_details'],
    answeredSoFar: true,
  },
  {
    id: 'ability-scores',
    title: 'Ability scores',
    ask: [
      'Which abilities matter most for this character, and which can be low?',
      'Here is a spread for it (a point buy: offer_point_buy shows it to change and confirm; rolled: where each number goes): does it look right?',
    ],
    guide: 'A point buy is the player\'s to set: call offer_point_buy once, as soon as you know the points, with your '
      + 'best spread of base scores (before the race) for the concept and class: the scores the player set, raise (the '
      + 'ones to max, first first) and lower (the ones to dump), and it fills the rest to the points. The chat shows it '
      + 'to the player to change and confirm, and the app sets it: never set_ability_scores or price a '
      + 'point buy, and never ask the player to agree in words. Rolled scores: never price them, suggest where each '
      + 'rolled number goes and say nothing of points; once the player agrees, set_ability_scores "rolled".',
    tools: ['set_ability_scores'],
    completesWith: ['set_ability_scores'],
    // where each score goes, not only which were rolled or how they are made: abilities named with their numbers
    answeredEarly: /(\b(str|dex|con|int|wis|cha)[a-z]*\b\W{0,3}([3-9]|1\d|20)\b[^a-z0-9]*[a-z]*\W*){3}/i,
    missing: service => ABILITIES.every(a => service.raw().abilityScores?.[a] === 10) ? 'set the ability scores' : undefined,
    onSheet: service => {
      const scores = service.raw().abilityScores || {};
      return ABILITIES.every(a => scores[a] === 10) ? undefined : ABILITIES.map(a => `${a} ${scores[a]}`).join(', ');
    },
  },
  {
    id: 'race',
    title: 'Race',
    ask: [
      'Which race (Dwarf, Elf, Gnome, Half-Elf, Halfling, Half-Orc, Human, or another)?',
      'The race\'s choices: which ability gets the +2 (Half-Elf, Half-Orc, Human), any alternate racial traits?',
      'Bonus languages for a high Intelligence, if any?',
    ],
    guide: 'Only a Half-Elf, Half-Orc or Human picks where its +2 goes (ask which, never pick it); every other core race '
      + 'has fixed modifiers (an elf: +2 Dex, +2 Int, -2 Con), never ask about them. Look the race up (kind race) and '
      + 'set_race with its racial stats first (ability modifiers, speed, size, languages), then its traits. A trait giving a feat is "bonusFeats": 1, a human\'s '
      + 'Skilled is "bonusSkillRanks": "{level}", darkvision or low-light vision "senses", a dwarf\'s speed that armor and '
      + 'loads never reduce "speedUnslowedByArmorAndLoad": true. A bonus only against something '
      + '(Hardy: vs. poison, spells) is a variant, "saves.fort[vs. poison]", never the plain save. An alternate racial '
      + 'trait the player picked (look the race page up with focus "alternate racial traits" to offer them) goes in with '
      + '"replaces", the standard traits it replaces, and those are left out. Every race of the Core '
      + 'Rulebook and Advanced Race Guide is Small or Medium: for a Large character say so plainly, and offer the closest '
      + '(a half-orc or an orc for Strength) or a monster race only the GM can allow (a centaur).',
    tools: ['set_race'],
    completesWith: ['set_race'],
    tellsApart: true,
    answeredEarly: new RegExp(`\\b(${RACES})\\b`, 'i'),
    missing: service => service.raw().race?.features?.length ? undefined : 'set the race',
    onSheet: service => {
      const race = service.raw().race;
      return race?.features?.length ? `${race.name} (${named(race.features)})` : undefined;
    },
  },
  {
    id: 'class',
    title: 'Class',
    ask: [
      'Which class? (suggest the ones that fit the concept)',
      'Your favored class (usually this one): +1 hit point, +1 skill rank, or an alternate bonus the race gives for this class (its race page lists them), at each of its levels?',
      'The class\'s 1st-level choices (a domain, bloodline, school, order, totem, bonus feat, ...)?',
      'An archetype? (one or more that fit the concept, if the table uses them)',
    ],
    guide: 'Look the class up (kind class, focus on level 1) and add_class_level with every 1st-level class feature of its '
      + 'table, each with its adjustments, and the favored class bonus (it makes the class the favored one): hp, skill, '
      + 'or other with favored_class_option, an alternate bonus the race page lists for the class (look the race page '
      + 'up with focus "favored class options" to offer them; a fraction is what one pick adds, "1/4"). A class '
      + 'bonus feat is a class feature with "bonusFeats": 1: one the class names (a wizard\'s Scribe Scroll) is named for '
      + 'the feat and the app gives it, one the player picks (a fighter\'s) is picked at the feats step. A 1st-level '
      + 'choice (a bloodline, domain, order, school, mystery) gives 1st-level powers of its own (claws, bloodline arcana, each '
      + 'domain\'s granted power, a revelation): look the choice up (kind mystery, curse, revelation with within, bloodline, '
      + 'domain or arcane school; or follow the class page\'s links) and add each as a class feature too, its class '
      + 'skills as "skills.<skill>.classSkill": true. A feature used a number of '
      + 'times a day (rage, channel energy, a domain power) gives "uses_by_level". A class without a preset gives its weapon and armor proficiencies, its alignment, '
      + 'and table_row, its table\'s 1st row as listed ({"bab": 1, "fort": 2, "ref": 2, "will": 0}). '
      + 'A class that casts spells: the engine works out its caster level, slots, bonus spells and DCs from its levels, '
      + 'so no class feature adjusts its caster level or spells per day; a class without a preset gives "spellcasting" '
      + '(its casting ability, prepared or spontaneous, arcane or divine, and its table: a core class\'s it shares, '
      + '"table": "sorcerer" for an oracle, else its own rows). A specialist wizard gives school and opposition_schools, '
      + 'a cleric its domains: ask the player first. The spells themselves are added at the spells step. '
      + 'An archetype is looked up (kind archetype, its class first: "Barbarian Invulnerable Rager") and given with the '
      + 'level as archetypes, with every class feature it replaces or alters: the level\'s features are then its '
      + '1st-level features with those of the class it keeps, and its class skills and proficiencies as it changes them. '
      + CLASS_FEATURE_RECIPE,
    tools: ['add_class_level', 'set_character_details', 'create_feature', 'set_caster_choices', 'set_class_spellcasting', 'set_favored_class_bonus'],
    completesWith: ['add_class_level'],
    // the class is often said with the concept, the favored class bonus is the player's choice
    answeredEarly: /\b(hp|hit points?|skill ranks?|favou?red)\b/i,
    missing: service => {
      const raw = service.raw();
      if (!characterLevel(raw)) return 'add the first class level';
      return raw.favoredClasses?.length ? undefined : 'set the favored class';
    },
    onSheet: service => {
      const raw = service.raw();
      if (!characterLevel(raw) || !raw.favoredClasses?.length) return undefined;
      const levels = new Map<string, number>();
      for (const l of raw.classLevels) levels.set(l.name, Math.max(levels.get(l.name) ?? 0, l.level));
      return `${[...levels].map(([name, level]) => `${name} ${level}`).join(', ')}, favored class ${raw.favoredClasses.join(', ')}`;
    },
  },
  {
    id: 'skills',
    title: 'Skills',
    ask: ['Where do your skill ranks go? (suggest class skills that fit the concept, with how many ranks there are)'],
    guide: 'get_level_up_status says how many ranks there are and the most per skill. In Pathfinder a rank costs one '
      + 'point, class skill or not (no half ranks), and a class skill with a rank gets +3. Never suggest a skill at its '
      + 'most ranks. When the player names more skills than there are ranks, say so and ask what to drop; set every '
      + 'skill they asked for. Once the player agrees, set_skill_ranks.',
    tools: ['set_skill_ranks'],
    completesWith: ['set_skill_ranks'],
    answeredEarly: new RegExp(`\\b(${SKILLS})\\b`, 'i'),
    missing: service => {
      const {available, spent} = skillRankBudget(service.applied());
      return available > spent ? `${available - spent} skill ranks are left to spend` : undefined;
    },
    onSheet: service => {
      const applied = service.applied();
      const {available, spent} = skillRankBudget(applied);
      if (!spent || available > spent) return undefined;
      return Object.entries(applied.skills || {}).filter(([, s]: [string, any]) => s?.ranks > 0)
        .map(([key, s]: [string, any]) => `${key} ${s.ranks}`).join(', ');
    },
  },
  {
    id: 'feats',
    title: 'Feats',
    ask: ['Which feats? (say how many, and suggest a few the character qualifies for that fit the concept)'],
    guide: 'A bonus feat a feature names (a half-elf\'s Skill Focus, a sorcerer\'s Eschew Materials) is added too, the '
      + 'player picks the rest. Suggest from what you know, without looking anything up; look up only the feats the player picks, in one '
      + 'look_up_rules call with names, and add each with create_feature in feats with its prerequisites (the app checks them against the sheet). A bonus to '
      + 'one weapon or maneuver is a variant; a combat option (Power Attack) is "availableCombatOptions.powerAttack": true; '
      + 'uses added to a class feature (Extra Channel) are "extraUses.channel energy": 2. Never add a feat the player '
      + 'did not pick: when the app says one is left, ask for it.',
    tools: ['create_feature'],
    completesWith: ['create_feature'],
    answeredEarly: /\bfeats?\b/i,
    missing: service => {
      const applied = service.applied();
      const left = availableFeats(applied) - (applied.feats || []).length;
      return left > 0 ? `${left} feat${left > 1 ? 's are' : ' is'} left to pick` : undefined;
    },
    onSheet: service => {
      const applied = service.applied();
      const feats = applied.feats || [];
      return feats.length && availableFeats(applied) <= feats.length ? named(feats) : undefined;
    },
  },
  {
    id: 'traits',
    title: 'Traits',
    ask: ['Which two traits (suggest some that fit the concept and background), and a drawback for a third?'],
    guide: 'Only if the table uses traits: when the concept says it does not, complete this step at once with that, '
      + 'asking nothing. Suggest from what you know, only traits you are sure are published (Advanced Player\'s Guide, '
      + 'Ultimate Campaign), by their exact names and categories, never made up; look up only the traits the player picks (kind trait, all in one '
      + 'round), and add each with create_feature in traits (drawbacks in drawbacks).',
    tools: ['create_feature'],
    // that the table uses none
    answeredEarly: NO_TRAITS,
    // the concept said the table uses none: nothing to ask
    skip: service => NO_TRAITS.test(service.raw().creation?.decisions?.['concept'] || ''),
    onSheet: service => {
      const raw = service.raw();
      return raw.traits?.length ? [named(raw.traits), raw.drawbacks?.length ? `drawback ${named(raw.drawbacks)}` : ''].filter(Boolean).join(', ') : undefined;
    },
  },
  {
    id: 'levels',
    title: 'Higher levels',
    ask: [
      'For each level after the 1st: which class, and the hit die (rolled, or the average if the table takes it)?',
      'The choices each level brings: skill ranks, a feat at odd levels, an ability increase at 4th, 8th, ..., and its class features\' choices (a rage power, a talent)?',
    ],
    guide: 'The character is made at a higher level (starting_level): add each level after the 1st with add_class_level, '
      + 'one call per level in order, each with that level\'s class features from the class page, the hit die (the '
      + 'player\'s roll, or the average, half the die + 1, when the table takes it), the favored class bonus and the '
      + 'ability increase of a 4th level. Then the skill ranks of every level (set_skill_ranks, at most the character '
      + 'level in a skill), a feat for every odd level and each bonus feat (create_feature), and what each class '
      + 'feature lets the player choose. Ask the player level by level, or for a plan of all of them; never choose for '
      + 'them. get_level_up_status says what is left. ' + CLASS_FEATURE_RECIPE,
    tools: ['add_class_level', 'set_favored_class_bonus', 'choose_ability_increase', 'set_skill_ranks', 'create_feature'],
    completesWith: ['add_class_level', 'set_skill_ranks', 'create_feature', 'choose_ability_increase'],
    answeredEarly: /(rolled|roll(ed)? an? \d+|(take|takes|taking) the average|average hp|levels? (in|of) [a-z]+)\b/i,
    skip: service => startingLevelOf(service.raw()) <= 1,
    missing: service => {
      const raw = service.raw();
      const applied = service.applied();
      const level = characterLevel(raw);
      const target = startingLevelOf(raw);
      const {available, spent} = skillRankBudget(applied);
      const feats = availableFeats(applied) - (applied.feats || []).length;
      const increases = pendingAbilityIncreases(raw);
      const left = [
        ...(level < target ? [`levels ${level + 1} to ${target} (add_class_level, one call per level)`] : []),
        ...(available > spent ? [`${available - spent} skill ranks`] : []),
        ...(feats > 0 ? [`${feats} feat${feats > 1 ? 's' : ''}`] : []),
        ...(increases ? [`${increases} ability increase${increases > 1 ? 's' : ''}`] : []),
      ];
      return left.length ? `still to add: ${left.join(', ')}` : undefined;
    },
    checks: ['class', 'skills', 'feats', 'level'],
  },
  {
    id: 'equipment',
    title: 'Equipment',
    ask: [
      'Starting gold: the class\'s average, or roll it?',
      'What do you buy? (suggest a kit for the class and concept: weapons, armor, adventuring gear, within the gold)',
    ],
    guide: 'get_creation_status says the gold left: a character made above 1st level has the wealth of its level '
      + 'instead of its class\'s gold, and spends no more than half of it on one item (magic items too: a cloak of '
      + 'resistance, a weapon\'s enhancement). Suggest a kit from what you know, without looking anything up, '
      + 'priced with one price_gear call (never add prices up yourself). Once the player agrees, look up only its '
      + 'weapons and armor, in one look_up_rules call with names, then buy the whole kit in one create_items call, '
      + 'each with its cost (it comes off the starting gold), equipping what the character uses. The '
      + 'starting outfit is free (cost_gp 0, slot body). cost_gp is the price of one piece: an item its page '
      + 'sells by the bundle (ammunition) is the bundle\'s price over its count. Armor needs its armor_category from its '
      + 'page. A weight is one piece\'s, from its page. When what the character carries is more than a light load, '
      + 'create_items says so: tell the player what it does and offer what to leave behind (a character may be made '
      + 'under any load). When the gear is bought, complete the step.',
    tools: ['create_item', 'create_items'],
    onSheet: service => service.raw().inventory?.length ? named(service.raw().inventory) : undefined,
  },
  {
    id: 'spells',
    title: 'Starting spells',
    ask: [
      'Which spells does the character know, or keep in its spellbook? (say how many it gets at each level, and suggest some that fit the concept)',
      'For a prepared caster: which does it prepare today?',
    ],
    guide: 'get_creation_status (spells) says each caster\'s levels: what it casts a day, the spells it knows at most '
      + '(a spontaneous caster), and what is on its list. Its class page says what it starts with (a wizard\'s '
      + 'spellbook: every cantrip but its opposition schools\', plus 3 + its Int modifier 1st-level spells; a cleric '
      + 'prepares from its whole list). Suggest from what you know; once the player picks, look the spells up in one '
      + 'look_up_rules call with names (kind spell), or say own knowledge for the cantrips, and add them with add_spells, '
      + 'one call per caster, each with its level for that class, school, components, saving throw and spell '
      + 'resistance. A buff the character casts on itself gets its adjustments. Then a prepared caster prepares the '
      + 'day\'s spells with prepare_spells, its domain or school slot with slot extra. Complete the step once the sheet '
      + 'has them. Never add a spell the player did not pick: suggest, then ask.',
    tools: ['add_spells', 'prepare_spells', 'remove_spells', 'set_caster_choices'],
    completesWith: ['add_spells', 'prepare_spells'],
    answeredEarly: /\b(spells?|cantrips?|orisons?)\b/i,
    skip: service => !Object.keys(service.applied().spells || {}).length,
    missing: service => {
      const empty = Object.entries(service.applied().spells || {}).filter(([, caster]) => caster?.classTable
        && (caster.spells || []).some((level, index) => level && (caster.maxSpellLevel === undefined || index <= caster.maxSpellLevel)
          && (level.atWill || level.perDay.total > 0 || (level.known ?? 0) > 0) && !level.spells.length)).map(([origin]) => origin);
      if (empty.length) return `${empty.join(', ')} ${empty.length > 1 ? 'have' : 'has'} levels with no spells on its list (add_spells)`;
      const unprepared = Object.entries(service.applied().spells || {}).filter(([, caster]) => caster?.casting === 'prepared'
        && !(caster.spells || []).some(level => (level?.prepared || []).length)).map(([origin]) => origin);
      return unprepared.length ? `${unprepared.join(', ')} prepared nothing for the day (prepare_spells)` : undefined;
    },
    onSheet: service => {
      const lists = Object.entries(service.applied().spells || {}).map(([origin, caster]) =>
        `${origin}: ${(caster?.spells || []).flatMap(level => level?.spells || []).map(s => s.name).join(', ')}`);
      return lists.some(l => !l.endsWith(': ')) ? lists.join('; ') : undefined;
    },
  },
  {
    id: 'details',
    title: 'Description and personality',
    ask: [
      'Name, age, height and weight?',
      'Alignment (within the class\'s limits) and deity?',
      'What do they look like, and a few words on their personality?',
      'Their backstory: where they come from, and what made them who they are?',
    ],
    guide: 'Suggest what fits the concept for what the player leaves open, then set_character_details with all of it, the deity the concept named too. '
      + 'Completing this step ends the creation once the app\'s check of the whole character passes: get_creation_status shows it (check). '
      + 'Fix each error it lists with the tools, asking the player where it is their choice.',
    tools: ['set_character_details'],
    completesWith: ['set_character_details'],
    answeredEarly: /\b(named|call(ed)? (him|her|them|it)|my name|\d+ ?(years|yrs|lbs|pounds)|lawful|chaotic|neutral (good|evil)|true neutral|worships?|deity)\b|\d'\s?\d+"/i,
    tellsApart: true,
    missing: service => service.raw().name && service.raw().name !== 'New Character' ? undefined : 'give the character a name',
    onSheet: service => {
      const raw = service.raw();
      return raw.name && raw.name !== 'New Character' ? `${raw.name}, ${raw.alignment}${raw.deity ? `, ${raw.deity}` : ''}` : undefined;
    },
  },
  {
    id: 'review',
    title: 'Review',
    ends: true,
    ask: ['Here is the character (hit points, AC, saves, initiative, attacks, skills): anything to change?'],
    guide: 'The creation is over: read get_character_summary and show what the sheet worked out, from it (never your own '
      + 'numbers), and ask if anything should change (edit_feature, edit_item and the other tools change it).',
    tools: [],
  },
];

// the scripts the app runs with the AI: creating the character (raw.creation) and leveling it up (raw.levelUp, see
// level-up-script.ts). one at a time: a creation is under way until it ends, a level up is started once it is created
export const stepsOf = (progress: CreationProgress | undefined): CreationStep[] =>
  progress?.script === 'level-up' ? LEVEL_UP_STEPS
    : progress?.script && progress.script in COMPANION_STEPS ? COMPANION_STEPS[progress.script as CompanionScript] : CREATION_STEPS;

// the progress a creation starts at: the creation's concept, or a companion's own first step (companion-scripts.ts)
export const startingProgress = (raw: Pick<Character, 'master'>): CreationProgress => {
  const script = companionScriptOf(raw);
  return script ? {script, step: stepsOf({script, step: '', decisions: {}})[0].id, decisions: {}} : {step: CREATION_STEPS[0].id, decisions: {}};
};
export const progressOf = (raw: {creation?: CreationProgress, levelUp?: CreationProgress}): CreationProgress | undefined =>
  raw.creation ?? raw.levelUp;
const saveProgress = (service: ApplyCharacterService, progress: CreationProgress, now: CreationProgress | undefined): void =>
  service.update(progress.script === 'level-up' ? {levelUp: now} : {creation: now});
// what the script is called to the AI, and the tool that completes its steps
const scriptName = (progress: CreationProgress | undefined): string => progress?.script === 'level-up' ? 'the level up' : 'the creation';
const completeTool = (progress: CreationProgress | undefined): string => progress?.script === 'level-up' ? 'complete_level_up_step' : 'complete_creation_step';

// the requirement groups a step is checked by
const checkedBy = (step: CreationStep): string[] => [step.checks ?? step.id].flat();

const stepById = (id: string, steps: CreationStep[] = CREATION_STEPS): CreationStep | undefined => steps.find(step => step.id === id);

const FROM_SHEET = 'already on the sheet: ';

// the next step to ask about after the one given: past the steps that do not apply to the character, and past
// those the sheet already has, whose decisions are filled in from it
const nextStep = (
  service: ApplyCharacterService, after: string, decisions: {[step: string]: string}, steps: CreationStep[] = CREATION_STEPS,
): {step?: CreationStep, filled: {[step: string]: string}} => {
  const filled: {[step: string]: string} = {};
  const index = steps.findIndex(step => step.id === after);
  for (const step of steps.slice(index + 1)) {
    if (step.skip?.(service)) continue;
    const onSheet = decisions[step.id] ? undefined : step.onSheet?.(service);
    if (!onSheet) return {step, filled};
    filled[step.id] = FROM_SHEET + onSheet;
  }
  return {filled};
};

// what the sheet already has, by step title, for the chat's opening message
export const filledOnSheet = (service: ApplyCharacterService): {title: string, value: string}[] =>
  CREATION_STEPS.filter(step => !step.skip?.(service))
    .map(step => ({title: step.title, value: step.onSheet?.(service)}))
    .filter((s): s is {title: string, value: string} => !!s.value);

// the question the chat opens with when a character is created with the AI, asked by the app (it costs no request)
export const CREATION_OPENER = 'What kind of character are we building?';
export const creationOpener = (service: ApplyCharacterService): string => {
  // a creation left midway (the page reloaded) goes on where it was
  const at = stepById(service.raw().creation?.step ?? '');
  if (at && at.id !== CREATION_STEPS[0].id) return `Let's go on creating the character: we're at ${at.title}.\n\n${at.ask.map(q => `- ${q}`).join('\n')}`;
  // a companion says what it is first (rules/companions.ts): a cohort's level, below its leader's
  const companion = companionLine(service.raw());
  const script = companionScriptOf(service.raw());
  if (script) return `We're building ${service.raw().name}, ${companion}.\n\n${stepsOf({script, step: '', decisions: {}})[0].ask.map(q => `- ${q}`).join('\n')}`;
  const opener = companion ? `We're building ${service.raw().name}, ${companion}. ${CREATION_OPENER}` : CREATION_OPENER;
  const filled = filledOnSheet(service);
  if (!filled.length) return opener;
  return `${opener}\n\nAlready on the sheet, I'll go past these:\n${filled.map(f => `- ${f.title}: ${f.value}`).join('\n')}`;
};

// what the chat knows of the conversation: the player's messages so far, and the step whose questions the AI was
// last given, at which of them
export interface CreationConversation {
  playerTurns: number;
  asked?: {step: string, turn: number};
  // what the player wrote, for the answers they gave before a step was asked (see answeredInWords)
  playerMessages?: string[];
}

// how the table makes ability scores, as the player says it
const SCORES_MADE = /point.?buy|\broll|\bstandard array|\b(10|15|20|25)\s*(points|pt)|(\b([3-9]|1\d)\b\D+){5}\b([3-9]|1\d)\b/i;

const words = (text: string): string => text.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

// the AI quotes the player's own words answering a step: true when the player wrote them (most of their words, in one
// message), so an answer given early counts without asking again, and an answer the player never gave does not
export const answeredInWords = (quote: unknown, conversation: CreationConversation, step?: CreationStep): boolean => {
  const said = typeof quote === 'string' ? words(quote) : '';
  if (said.length < 2) return false;
  // words of the player that do not answer the step (the concept quoted for every step) are no answer to it
  if (step && !step.answeredEarly?.test(quote as string)) return false;
  const quoted = said.split(' ').filter(w => w.length > 2 || /\d/.test(w));
  return (conversation.playerMessages || []).map(words).some(message => message.includes(said)
    || (quoted.length > 0 && quoted.filter(w => message.includes(w)).length / quoted.length >= 0.75));
};

// the player's latest message answers another step, not this one (the name given while the traits are asked): it is
// no answer to this step's questions
const answersAnother = (step: CreationStep, conversation: CreationConversation, steps: CreationStep[] = CREATION_STEPS): boolean => {
  const latest = conversation.playerMessages?.[conversation.playerMessages.length - 1];
  // the concept takes everything the player says about the character
  if (!latest || step.answeredSoFar || step.answeredEarly?.test(latest)) return false;
  return steps.some(other => other !== step && other.tellsApart && other.answeredEarly?.test(latest));
};

// the player's latest message, when it answers the step by its shape (a race named, the name and alignment given)
const latestAnswers = (step: CreationStep, conversation: CreationConversation): boolean => {
  const latest = conversation.playerMessages?.[conversation.playerMessages.length - 1];
  return !!latest && !!step.answeredEarly?.test(latest);
};

// the player asking for suggestions ("suggest two traits") picked nothing yet, unless they leave it to the AI
const ASKS_SUGGESTIONS = /\b(suggest(ions?)?|recommend(ations?)?|ideas?|options|what (do|would|should) (you|i)|any good)\b/i;
const LEAVES_IT = /\byou (pick|choose|decide)\b|\bsurprise me\b|\bup to you\b|\b(whatever|either|any) (you|is fine|works)\b|\bgo (with|for) (it|that|those|them|your|the)\b|\b(sounds|looks) (good|great|fine)\b|^\s*(yes|yep|sure|ok(ay)?)\b/i;
export const asksForSuggestions = (message: string | undefined): boolean =>
  !!message && ASKS_SUGGESTIONS.test(message) && !LEAVES_IT.test(message);

// the player answered the step: a message since its questions were given, their latest message has its answer, or
// their earlier words quoted
const answered = (step: CreationStep, conversation: CreationConversation, quote: unknown, steps: CreationStep[] = CREATION_STEPS): boolean => {
  const asked = conversation.asked;
  const latest = conversation.playerMessages?.[conversation.playerMessages.length - 1];
  if (!step.answeredSoFar && asksForSuggestions(latest)) return answeredInWords(quote, conversation, step) && !asksForSuggestions(String(quote));
  if (asked?.step === step.id && (step.answeredSoFar ? conversation.playerTurns >= 1 : conversation.playerTurns > asked.turn)
    && !answersAnother(step, conversation, steps)) return true;
  // a race (or the name) the player gave in any message: its other choices came later (the +2 asked for since)
  if (step.tellsApart && step.answeredEarly && conversation.playerMessages?.some(m => step.answeredEarly!.test(m))) return true;
  return latestAnswers(step, conversation) || answeredInWords(quote, conversation, step);
};

const notAnswered = (step: CreationStep, conversation?: CreationConversation): string => (asksForSuggestions(conversation?.playerMessages?.[conversation.playerMessages.length - 1])
  ? `nothing was changed: the player asked for suggestions for "${step.title}", they have not picked yet. Suggest, ask which they want and end your message: call no more tools.`
  : `nothing was changed: the player has not answered "${step.title}" yet. `
  + (step.answeredEarly ? 'If they did in an earlier message, call again with player_answer set to their own words that answer it. ' : '')
  + 'Ask its questions now and end your message: call no more tools.');

// the changes the creation holds back: a step's tools only at that step, and only once the player answered its
// questions (a message after the AI was given them, their latest message answering it, or their words quoted in
// player_answer). a tool of another step runs when the player's words answer it: the steps it fills are gone past, as
// filled on the sheet. edits and removals of what was added are the player's corrections, never held back.
// undefined when the tool may run
export const creationGate = (
  progress: CreationProgress | undefined, tool: string, conversation: CreationConversation,
  args: {[name: string]: unknown} = {}, service?: ApplyCharacterService,
): string | undefined => {
  if (!progress) return undefined;
  const steps = stepsOf(progress);
  const step = stepById(progress.step, steps);
  if (!step) return undefined;
  // a level up adds one level: the next is a level up of its own, once this one is done
  if (progress.script === 'level-up' && tool === 'add_class_level' && service && characterLevel(service.raw()) > (progress.fromLevel ?? Infinity)) {
    return `nothing was changed: this level up added its level already (level ${characterLevel(service.raw())}). Finish it (complete_level_up_step), then start the next with get_level_up_step`;
  }
  const owners = steps.filter(s => s.tools.includes(tool));
  if (!owners.length || EDITS.includes(tool)) return undefined;
  const held = heldChoice(tool, conversation, args);
  if (held) return held;
  if (!step.tools.includes(tool)) {
    // a step completed already can be changed: the player answered it (and the check of the character asks for fixes)
    if (owners.some(owner => progress.decisions?.[owner.id] !== undefined)) return undefined;
    if (owners.some(owner => latestAnswers(owner, conversation) || answeredInWords(args['player_answer'], conversation, owner))) return undefined;
    return `nothing was changed: ${scriptName(progress)} is at "${step.title}", ${tool} is for ${owners.map(o => `"${o.title}"`).join(' or ')}. `
      + `Finish "${step.title}" first (its changes, then ${completeTool(progress)}). If the player already answered ${owners.length > 1 ? 'one of those' : 'that'} step, `
      + 'call again with player_answer set to their own words.';
  }
  return answered(step, conversation, args['player_answer'], steps) ? undefined : notAnswered(step, conversation);
};

// the choices in a change that are the player's to make, which an answer to something else does not make: the
// favored class bonus (a player answering "just Common" to the languages got +1 skill rank chosen for them)
// and the +2 of a human, half-elf or half-orc (the race set from the concept had the AI's pick)
const ABILITY = '(str(ength)?|dex(terity)?|con(stitution)?|int(elligence)?|wis(dom)?|cha(risma)?)';
const FLEXIBLE_RACE = /\b(human|half-?elf|half-?orc)\b/i;
// said: the player's words that make the choice; asked: the step whose questions ask it, a message since which naming
// it (an ability, "Strength") makes it too
const CHOICES: {tool: string, arg: string, said: RegExp, ask: string, when?: (args: {[name: string]: unknown}) => boolean,
  asked?: {step: string, named: RegExp}}[] = [
  {tool: 'add_class_level', arg: 'favored_class_bonus', said: /\b(hp|hit points?|skill( ranks?)?|favou?red)\b/i,
    ask: 'whether the favored class bonus is +1 hit point or +1 skill rank'},
  {tool: 'set_race', arg: 'name', ask: 'which ability gets the race\'s +2 (its choice to make)',
    said: new RegExp(`\\+\\s?2[^.\\d]{0,20}\\b${ABILITY}\\b|\\b${ABILITY}\\b[^.\\d]{0,20}\\+\\s?2\\b|\\b(put|goes?|go|into|on|to)\\b[^.\\d]{0,15}\\b${ABILITY}\\b[^.]{0,20}\\b(bonus|\\+2)|\\b(bonus|\\+2)\\b[^.]{0,20}\\b${ABILITY}\\b`, 'i'),
    when: args => FLEXIBLE_RACE.test(String(args['name'] ?? '')), asked: {step: 'race', named: new RegExp(`\\b${ABILITY}\\b`, 'i')}},
];

const heldChoice = (tool: string, conversation: CreationConversation, args: {[name: string]: unknown}): string | undefined => {
  for (const choice of CHOICES) {
    if (choice.tool !== tool || args[choice.arg] === undefined || args[choice.arg] === '') continue;
    if (choice.when && !choice.when(args)) continue;
    const said = conversation.playerMessages || [];
    const since = choice.asked && conversation.asked?.step === choice.asked.step ? said.slice(conversation.asked.turn) : [];
    if (since.some(m => choice.asked!.named.test(m))) continue;
    if (!said.some(m => choice.said.test(m)) && !(typeof args['player_answer'] === 'string' && choice.said.test(args['player_answer'])
      && answeredInWords(args['player_answer'], conversation))) {
      return `nothing was changed: the player has not said ${choice.ask}. Ask them and end your message`;
    }
  }
  return undefined;
};

// a lookup to suggest from (feats, traits) before the player picked: each is a request, and the AI knows the
// common ones. the player's picks are looked up once they said them. undefined when the lookup may run
export const suggestionLookup = (
  progress: CreationProgress | undefined, conversation: CreationConversation, args: {[name: string]: unknown},
): object | undefined => {
  const step = progress && stepById(progress.step, stepsOf(progress));
  if (!step || !SUGGESTED[step.id]) return undefined;
  const kind = typeof args['kind'] === 'string' ? args['kind'] : '';
  if (kind && !SUGGESTED[step.id].includes(kind)) return undefined;
  const asked = conversation.asked;
  const pickedSince = asked?.step === step.id && conversation.playerTurns > asked.turn;
  const name = typeof args['name'] === 'string' ? args['name'] : String(args['names'] ?? '');
  if (pickedSince || (name && answeredInWords(name, conversation))) return undefined;
  return {error: `not looked up, and call no more tools now: suggest ${step.id === 'equipment' ? 'a kit' : step.id} from what you know, `
    + 'write your answer and end your message. Look up only what the player picks or asks about, once they did, all in one call'};
};
// the steps whose suggestions come from what the AI knows, and the kinds of rule looked up for them: a lookup is a
// request, and the AI looked up nine feats and eight pieces of gear before suggesting any
const SUGGESTED: {[step: string]: string[]} = {
  feats: ['feat'], traits: ['trait'], equipment: ['weapon', 'armor', 'gear', 'magic item'], 'level-feats': ['feat'],
};

const stepView = (step: CreationStep, progress: CreationProgress) => ({
  step: step.id, title: step.title, number: `${stepsOf(progress).indexOf(step) + 1} of ${stepsOf(progress).length}`,
  ask: step.ask, guide: step.guide, tools: step.tools,
  // what the app checks before the step completes: built to it, the step completes at the first try
  ...(checkedBy(step).flatMap(stepRequirements).length ? {appRequires: checkedBy(step).flatMap(stepRequirements)} : {}),
  decidedSoFar: progress.decisions,
  howTo: 'This is the step to ask about now, no need to read it again. When the player already answered all of it, '
    + 'make its changes now (player_answer: their words). Otherwise ask what is left (suggest answers from what they '
    + 'decided so far, and say why), then end your message and wait. Make the changes once they answered, then '
    + `${completeTool(progress)} with what they decided.`,
});

// the step the creation is at, starting it for a character with no class level. what it gives is what the AI asks
export const getCreationStep = (service: ApplyCharacterService, conversation: CreationConversation): object => {
  let progress = service.raw().creation;
  if (!progress) {
    if (characterLevel(service.raw())) return {error: 'the character is not being created: it has class levels already'};
    progress = startingProgress(service.raw());
    service.update({creation: progress});
  }
  const steps = stepsOf(progress);
  const step = stepById(progress.step, steps) || steps[0];
  // the step it was just given, read again: what it needs is in that result already
  if (conversation.asked?.step === step.id && conversation.asked.turn === conversation.playerTurns && conversation.playerTurns > 0
    && step.id !== steps[0].id) {
    return {step: step.id, title: step.title, note: 'this step was given in this turn already: ask its questions from that and end your message'};
  }
  // reading the step again keeps when it was first asked: the player's answer since still counts
  if (conversation.asked?.step !== step.id) conversation.asked = {step: step.id, turn: conversation.playerTurns};
  // a companion: what it is and what its kind allows, for every step's suggestions
  const companion = companionLine(service.raw());
  return {...stepView(step, progress), ...(companion ? {companion: `${service.raw().name} is ${companion}. `
    + (service.raw().master?.kind === 'cohort' ? 'A cohort (the Leadership feat) is at least 2 levels below its leader: its level comes from the Leadership score (the feat\'s page, look it up), set it with set_character_details starting_level.' : '')} : {})};
};

// the step the level up is at, starting one for a created character: one level, its steps as the character needs them
// (an ability increase on a 4th level, a feat on an odd one, spells for a caster). the problems the character has
// before it are kept, the check at its end tells them rather than holding it open
export const getLevelUpStep = (service: ApplyCharacterService, conversation: CreationConversation): object => {
  const raw = service.raw();
  if (raw.creation || !characterLevel(raw)) return {error: 'the character is being created: get_creation_step, a level up comes once it is created'};
  let progress = raw.levelUp;
  const notes: string[] = [];
  if (!progress) {
    const level = characterLevel(raw);
    if (!levelUpAvailable(raw)) notes.push(`the character has ${raw.experience || 0} xp, not yet the ${nextLevelXp(raw) ?? '?'} of level ${level + 1}: level up only if the player (or the GM) says so`);
    progress = {script: 'level-up', step: LEVEL_UP_STEPS[0].id, decisions: {}, fromLevel: level, known: checkLeveledCharacter(service).errors};
    service.update({levelUp: progress});
  }
  const step = stepById(progress.step, LEVEL_UP_STEPS) || LEVEL_UP_STEPS[0];
  if (conversation.asked?.step === step.id && conversation.asked.turn === conversation.playerTurns && conversation.playerTurns > 0) {
    return {step: step.id, title: step.title, note: 'this step was given in this turn already: ask its questions from that and end your message'};
  }
  if (conversation.asked?.step !== step.id) conversation.asked = {step: step.id, turn: conversation.playerTurns};
  return {...stepView(step, progress), level: `${progress.fromLevel} -> ${(progress.fromLevel ?? 0) + 1}`, ...(notes.length ? {notes} : {})};
};

// trusted: the app completes it (completedBy), the player's answer was checked when the change was made
export const completeCreationStep = (
  service: ApplyCharacterService, conversation: CreationConversation, args: {[name: string]: unknown}, trusted = false,
): ActionResult => {
  const progress = progressOf(service.raw());
  if (!progress) {
    return characterLevel(service.raw()) ? {note: 'no creation or level up is under way: nothing to complete (get_level_up_step starts a level up)'}
      : {error: 'the character is not being created (get_creation_step starts it)'};
  }
  const steps = stepsOf(progress);
  const leveling = progress.script === 'level-up';
  const step = stepById(progress.step, steps);
  if (!step) return {error: `unknown step ${progress.step}`};
  // the step by its id however it is spelled (ability_scores), or by its title
  const plain = (id: string): string => id.toLowerCase().replace(/[^a-z]/g, '');
  const named = typeof args['step'] === 'string' ? plain(args['step']) : '';
  // a step the app completed already (completedBy): nothing to do, the AI goes on
  const before = steps.find(s => named && (plain(s.id) === named || plain(s.title) === named) && progress.decisions[s.id]);
  if (before && before !== step) return {note: `"${before.title}" is done already: go on with "${step.title}"`};
  if (named && named !== plain(step.id) && named !== plain(step.title)) {
    return {error: `nothing was changed: ${scriptName(progress)} is at "${step.title}" (${step.id}), not ${args['step']}`};
  }
  const decided = typeof args['decisions'] === 'string' ? args['decisions'].trim() : '';
  if (!decided) return {error: 'decisions is what the player decided at this step, in a sentence or two'};
  if (!trusted && !answered(step, conversation, args['player_answer'], steps)) return {error: notAnswered(step, conversation)};
  // the concept says how the scores are made: the next step suggests a spread for it, never a point buy assumed
  if (step.id === 'concept' && conversation.playerMessages && !conversation.playerMessages.some(m => SCORES_MADE.test(m))) {
    return {error: 'nothing was changed: the player has not said how the table makes ability scores. Ask it (a point buy and its points, or rolled), and whether it uses traits, then end your message'};
  }
  const missing = step.missing?.(service);
  if (missing) return {error: `"${step.title}" is not done: ${missing}`};
  // what the step must leave on the sheet, checked by the app: fixed now, not found at the end. a level up is not held
  // by what was wrong before it
  const checks = checkedBy(step).map(id => checkCreationStep(service, id));
  const checked = {errors: checks.flatMap(c => c.errors), warnings: checks.flatMap(c => c.warnings)};
  const stepCheck = {...checked, errors: checked.errors.filter(e => !(progress.known || []).includes(e))};
  if (stepCheck.errors.length) {
    return {
      error: `nothing was changed: "${step.title}" is not done. Fix each of these with the tools, asking the player where it is their choice, then complete it again`,
      problems: stepCheck.errors,
    };
  }
  const {step: next, filled} = nextStep(service, step.id, progress.decisions, steps);
  // the end: the app checks the whole character first, and holds the creation open until every error is fixed
  const ending = !next || !!next.ends;
  const check = !ending ? undefined : leveling ? checkLeveledCharacter(service, progress.known)
    : (progress.script ?? '') in COMPANION_STEPS ? {errors: [], warnings: [...companionWarnings(service.raw()), ...eidolonWarnings(service.raw(), service.applied())]} : checkCreatedCharacter(service);
  if (check?.errors.length) {
    return {
      error: `nothing was changed: ${leveling ? 'the level up' : 'the character'} is not finished. Fix each of these with the tools (the steps they belong to can still be changed), asking the player where it is their choice, then complete "${step.title}" again`,
      problems: check.errors,
      ...(check.warnings.length ? {warnings: check.warnings} : {}),
    };
  }
  return service.labelled(`${leveling ? 'level up' : 'creation'}: ${step.title} done`, () => {
    const decisions = {...progress.decisions, [step.id]: decided, ...filled};
    // a companion's end (companion-scripts.ts): created, what its kind would have the player know told
    if ((progress.script ?? '') in COMPANION_STEPS && ending) {
      saveProgress(service, progress, undefined);
      const warnings = [...companionWarnings(service.raw()), ...eidolonWarnings(service.raw(), service.applied())];
      return {
        done: `${step.title} done: ${service.raw().name} is created`,
        checked: warnings.length ? `tell the player of ${warnings.join('; ')}` : 'nothing is missing',
        ...(next ? {now: `${next.guide} Nothing more to complete.`} : {}),
      };
    }
    // a level up's end: the level is in and checked, what was wrong before it told to the player
    if (leveling && ending) {
      saveProgress(service, progress, undefined);
      return {
        done: `${step.title} done: the character is level ${characterLevel(service.raw())}`,
        checked: check?.warnings.length ? `the app checked the level: tell the player of ${check.warnings.join('; ')}` : 'the app checked the level: nothing is missing',
        ...(next ? {now: `${next.guide}${check?.warnings.length ? ` Your answer starts with what the app found, in plain words: ${check.warnings.join('; ')}.` : ''} Nothing more to complete.`} : {}),
      };
    }
    // the review is the end: the character is created when it is reached, the AI shows it and the player changes what
    // they want with the usual tools (the creation used to wait for a completion of the review the AI never sent)
    if (ending) {
      // the starting gold not spent goes in the purse, as the new character page does on save (it stayed out of it)
      const raw = service.raw();
      const left = purseToCopper(new RemainingStartingWealthPipe().transform(raw));
      const purse = left > 0 ? copperToPurse(purseToCopper({...new Purse(), ...(raw.wealth || {})}) + left, 'gp') : undefined;
      // a character made above 1st level has the experience of its level
      const xp = startingLevelOf(raw) > 1 ? xpForLevel(characterLevel(raw), raw.advancementTrack) : undefined;
      service.update({creation: undefined, ...(purse ? {wealth: purse} : {}),
        ...(xp !== undefined && xp > (Number(raw.experience) || 0) ? {experience: xp} : {})});
      return {
        done: `${step.title} done: the character is created${purse ? `, the ${left / 100} gp of starting gold left put in the purse` : ''}`,
        checked: check?.warnings.length ? `the app checked the character: tell the player of ${check.warnings.join('; ')}` : 'the app checked the character: nothing is missing',
        // what the app found is said to the player in the AI's answer (a medium load went unmentioned)
        ...(next ? {now: `${next.guide}${check?.warnings.length ? ` Your answer starts with what the app found, in plain words: ${check.warnings.join('; ')}.` : ''} Nothing more to complete.`} : {}),
      };
    }
    const now: CreationProgress = {...progress, step: next!.id, decisions};
    saveProgress(service, progress, now);
    conversation.asked = {step: next!.id, turn: conversation.playerTurns};
    const past = Object.keys(filled).map(id => stepById(id, steps)!.title);
    return {done: `${step.title} done${past.length ? `, ${past.join(', ')} already on the sheet` : ''}`, next: stepView(next!, now)};
  });
};

// a change that finished its step (the scores set, the last feat taken): the step is completed with it, and the next
// one given to ask about. a change of a later step the player went on to (the name given once the gear was bought)
// completes the step the creation is at when it has what it needs and something on the sheet (the AI forgot to
// complete it, and the creation stayed there to the end), and that later step too when it is the next one. undefined
// when the step goes on (or nothing was completed)
export const completedBy = (
  service: ApplyCharacterService, conversation: CreationConversation, stepBefore: string | undefined, tool: string,
  args: {[name: string]: unknown}, done: string,
): ActionResult | undefined => {
  const progress = progressOf(service.raw());
  const steps = stepsOf(progress);
  const step = progress && stepById(progress.step, steps);
  if (!step || step.id !== stepBefore) return undefined;
  const at = steps.indexOf(step);
  const later = steps.find((s, i) => i > at && s.tools.includes(tool));
  if (!step.tools.includes(tool) && later) {
    const had = step.onSheet?.(service);
    if (!had || step.missing?.(service)) return undefined;
    const gone = completeCreationStep(service, conversation, {step: step.id, decisions: `${had} (went on to ${later.title})`}, true);
    if (!gone.done) return undefined;
    const now = stepById(progressOf(service.raw())?.step ?? '', steps);
    if (now !== later || !later.completesWith?.includes(tool) || later.missing?.(service)) return gone;
    const also = completeCreationStep(service, conversation, {step: later.id, decisions: done}, true);
    return also.done ? {...also, done: `${gone.done}; ${also.done}`} : gone;
  }
  if (!step.completesWith?.includes(tool) || step.missing?.(service)) return undefined;
  const completed = completeCreationStep(service, conversation, {step: step.id, decisions: done, player_answer: args['player_answer']});
  return completed.done ? completed : undefined;
};

// the AI ending its turn with the step it is at still open: it made the step's changes and went quiet, or told the
// player the character is done, without completing the step (a barbarian's gear was bought, "Your barbarian is
// ready!", and the name, looks and backstory were never asked). the note it is sent back with, once a turn;
// undefined when its message asks the player something, or nothing of the step was done this turn
const SAYS_DONE = /\b(is|are) (now )?(ready|done|complete|finished)\b|\ball (set|done)\b|\bready (to|for) (play|adventure)/i;
export const unfinishedStepNote = (service: ApplyCharacterService, changedTools: string[], reply: string): string | undefined => {
  const progress = progressOf(service.raw());
  const steps = stepsOf(progress);
  const step = progress && stepById(progress.step, steps);
  if (!step || step.ends) return undefined;
  const asks = /\?\s*(\*\*)?\s*$/.test(reply.trim()) || /\?\s*\n/.test(reply);
  if (asks) return undefined;
  const worked = changedTools.some(tool => step.tools.includes(tool));
  if (!worked && !SAYS_DONE.test(reply)) return undefined;
  const number = `${steps.indexOf(step) + 1} of ${steps.length}`;
  return `[the app: ${scriptName(progress)} is at "${step.title}" (${number}), and the step is not complete, so the `
    + 'character is not finished. Never tell the player it is done before the last step. If the player\'s answers '
    + `cover this step, ${completeTool(progress)} now and ask the next step's questions; else ask what is left of it.]`;
};

// the abilities a list names, "dex, str" or ["dex", "str"], in its order
const abilityList = (value: unknown): string[] => {
  const words = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[\s,;/]+|\band\b/) : [];
  return [...new Set(words.map(w => w.trim().toLowerCase().slice(0, 3)).filter(a => ABILITIES.includes(a as never)))];
};

const stepUp = (score: number): number => POINT_BUY_COST[score + 1] - POINT_BUY_COST[score];

// a spread that spends the budget: the scores the player set kept, the ones to lower at 7, the ones to raise as high as
// the points left go (in their order), what is left over on the rest one step at a time. the AI tried spread after
// spread to fit a budget (14 calls for one)
export const filledSpread = (
  given: {[ability: string]: number}, budget: number, set: string[], raise: string[], lower: string[],
): {scores: {[ability: string]: number}, note?: string} => {
  // the scores given are where it starts (the AI's spread: it asked dex 16 and raise dex, and the fill had reset dex to
  // 10 and given str every point), the ones to lower at 7
  const scores = {...given};
  lower.forEach(a => scores[a] = 7);
  const kept = set.filter(a => !raise.includes(a) && !lower.includes(a));
  const rest = ABILITIES.filter(a => !set.includes(a) && !raise.includes(a) && !lower.includes(a));
  let left = budget - pointBuyTotal(scores);
  // points left: the ones to raise first, in their order, as high as the points go, then the rest a step at a time
  for (const a of raise) {
    while (scores[a] < 18 && stepUp(scores[a]) <= left) {
      left -= stepUp(scores[a]);
      scores[a]++;
    }
  }
  for (let spent = true; left > 0 && spent;) {
    spent = false;
    for (const a of [...rest].sort((x, y) => scores[x] - scores[y])) {
      if (scores[a] < 18 && stepUp(scores[a]) <= left) {
        left -= stepUp(scores[a]);
        scores[a]++;
        spent = true;
        break;
      }
    }
  }
  // points over: a step off the ones nobody named (highest first), then off the ones to raise (the last first); the
  // scores the player set stay
  for (let taken = true; left < 0 && taken;) {
    taken = false;
    for (const a of [...[...rest].sort((x, y) => scores[y] - scores[x]), ...[...raise].reverse()]) {
      if (scores[a] > 7) {
        left += stepUp(scores[a] - 1);
        scores[a]--;
        taken = true;
        break;
      }
    }
  }
  void kept;
  const note = left > 0 ? `${left} point${left > 1 ? 's' : ''} left that no step up costs: say so, or move a point between scores`
    : left < 0 ? `${-left} points over with every score not set at 7: lower a score the player set` : undefined;
  return {scores, note};
};


// the point buy the player sets in the chat: the AI suggests a spread (the scores it has in mind, or the ones the
// player set with what to max and what to dump, filled to the points), the chat shows it to the player to change and
// confirm, and the app sets it. the AI got it wrong for many requests in a row (pricing spread after spread), and
// moving a point is the player's to do anyway
export interface PointBuyOffer {
  scores: {[ability: string]: number};
  budget: number;
}

export const offerPointBuy = (args: {[name: string]: unknown}, service?: ApplyCharacterService): object => {
  if (service && tableRollsScores(service)) {
    return {error: 'the table rolls its ability scores (the concept says so): suggest where each rolled number goes, then set_ability_scores "rolled"'};
  }
  const budget = Math.floor(Number(args['budget']));
  if (!(budget > 0)) return {error: 'budget is the points of the point buy the player said (10, 15, 20 or 25): ask it if they did not'};
  const read = parseJsonArg(args['scores'] ?? '{}', 'scores');
  if (read.error) return {error: read.error};
  const given: {[ability: string]: unknown} = read.value && typeof read.value === 'object' ? read.value : {};
  const clamp = (n: number): number => Math.min(POINT_BUY_MAX, Math.max(POINT_BUY_MIN, n));
  let scores = Object.fromEntries(ABILITIES.map(a => [a, clamp(Math.floor(Number(given[a] ?? 10)) || 10)]));
  const raise = abilityList(args['raise']);
  const lower = abilityList(args['lower']);
  const asked = {...scores};
  if (raise.length || lower.length) {
    scores = filledSpread(scores, budget, Object.keys(given).filter(a => ABILITIES.includes(a as never)), raise, lower).scores;
  }
  const total = pointBuyTotal(scores);
  const offer: PointBuyOffer = {scores, budget};
  // what the app changed of the AI's spread to fit the points, and what is left: the player is told both (the AI said
  // "Dex 16" of a spread the app had made 15, two points left unsaid)
  const changed = ABILITIES.filter(a => asked[a] !== scores[a]).map(a => `${a} ${asked[a]} -> ${scores[a]}`);
  const left = budget - total;
  return {
    offered: offer,
    ...(changed.length ? {changedToFit: `${changed.join(', ')}: your spread cost ${pointBuyTotal(asked)} of ${budget}`} : {}),
    ...(left > 0 ? {pointsLeft: `${left} point${left > 1 ? 's' : ''} unspent: say so, and where they could go`} : {}),
    shown: `the player sees the point buy in the chat: ${ABILITIES.map(a => `${a} ${scores[a]}`).join(', ')}, ${total} of ${budget} points. `
      + 'It shows below your message, the last thing of your answer (say "below", never "above"): they change it there '
      + 'and confirm it, the app sets it and completes the step. Say in a sentence why it fits the '
      + 'concept and what the race will add, then end your message: never set_ability_scores or price it again',
  };
};
