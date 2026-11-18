import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {ABILITIES, availableFeats} from '../rules/class-progression';
import {CreationProgress} from '../utils/character.class';
import {characterLevel} from '../utils/classlevel.class';
import {POINT_BUY_COST, pointBuyTotal} from './creation';
import {ActionResult} from './play-actions';

// the script of creating a character with the AI, the steps of the Core Rulebook (d20pfsrd, character creation):
// ability scores, race, class, skills, feats, then the rest. each step has the questions the AI asks, how it helps,
// the tools that make its changes and what must be true before it is done. the AI asks a step's questions, the
// player answers, the AI makes the changes and completes the step with what was decided, which the next steps read
// to suggest from. the app holds the AI to it: a step's changes are refused until the player answered its questions
// (see creationGate), and a step is not done until what it needs is there

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
}

const EDITS = ['edit_feature', 'remove_feature', 'edit_item', 'remove_item'];

export const CREATION_STEPS: CreationStep[] = [
  {
    id: 'concept',
    title: 'The concept',
    ask: [
      'What character do you want to play: their idea, their role in the party, how they fight or help?',
      'How does your table make ability scores: a point buy (10 low, 15 standard, 20 high, 25 epic fantasy) or rolled (4d6, drop the lowest)?',
      'Does your table use traits, and anything else to know (third-party content, rolled or average starting gold)?',
    ],
    guide: 'Skip any question the player already answered. This step changes nothing: complete it with their answers, '
      + 'right away when they already gave them.',
    tools: [],
    answeredSoFar: true,
  },
  {
    id: 'ability-scores',
    title: 'Ability scores',
    ask: [
      'Which abilities matter most for this character, and which can be low?',
      'Here is a spread for it (with the point buy cost of each score from price_point_buy): does it look right?',
    ],
    guide: 'Suggest base scores (before the race) for the concept and the class it points to, priced with price_point_buy '
      + '(never price them yourself), or ask for the rolled scores and where each goes. Say what the race will add. Once '
      + 'the player agrees, set_ability_scores with the method.',
    tools: ['set_ability_scores'],
    missing: service => ABILITIES.every(a => service.raw().abilityScores?.[a] === 10) ? 'set the ability scores' : undefined,
  },
  {
    id: 'race',
    title: 'Race',
    ask: [
      'Which race (Dwarf, Elf, Gnome, Half-Elf, Halfling, Half-Orc, Human, or another)?',
      'The race\'s choices: which ability gets the +2 (Half-Elf, Half-Orc, Human), any alternate racial traits?',
      'Bonus languages for a high Intelligence, if any?',
    ],
    guide: 'Look the race up (kind race) and set_race with its racial stats (ability modifiers, with the +2 on the ability '
      + 'the player picked, speed, size, languages) and traits. A trait giving a feat is "bonusFeats": 1, a human\'s '
      + 'Skilled is "bonusSkillRanks": "{level}".',
    tools: ['set_race'],
    missing: service => service.raw().race?.features?.length ? undefined : 'set the race',
  },
  {
    id: 'class',
    title: 'Class',
    ask: [
      'Which class? (suggest the ones that fit the concept)',
      'Your favored class (usually this one): +1 hit point or +1 skill rank at each of its levels?',
      'The class\'s 1st-level choices (a domain, bloodline, school, order, totem, bonus feat, ...)?',
    ],
    guide: 'Look the class up (kind class, focus on level 1) and add_class_level with its 1st-level class features and the '
      + 'favored class bonus; set the favored class with set_character_details. A class bonus feat at 1st level is added '
      + 'with create_feature in feats (look it up).',
    tools: ['add_class_level', 'set_character_details', 'create_feature'],
    missing: service => {
      const raw = service.raw();
      if (!characterLevel(raw)) return 'add the first class level';
      return raw.favoredClasses?.length ? undefined : 'set the favored class';
    },
  },
  {
    id: 'skills',
    title: 'Skills',
    ask: ['Where do your skill ranks go? (suggest class skills that fit the concept, with how many ranks there are)'],
    guide: 'get_level_up_status says how many ranks there are and the most per skill. Class skills with a rank get +3. '
      + 'Once the player agrees, set_skill_ranks.',
    tools: ['set_skill_ranks'],
    missing: service => {
      const {available, spent} = skillRankBudget(service.applied());
      return available > spent ? `${available - spent} skill ranks are left to spend` : undefined;
    },
  },
  {
    id: 'feats',
    title: 'Feats',
    ask: ['Which feats? (say how many, and suggest a few the character qualifies for that fit the concept)'],
    guide: 'Look each chosen feat up and add it with create_feature in feats, with its prerequisites checked against the '
      + 'sheet. A bonus to one weapon or maneuver is a variant.',
    tools: ['create_feature'],
    missing: service => {
      const applied = service.applied();
      const left = availableFeats(applied) - (applied.feats || []).length;
      return left > 0 ? `${left} feat${left > 1 ? 's are' : ' is'} left to pick` : undefined;
    },
  },
  {
    id: 'traits',
    title: 'Traits',
    ask: ['Which two traits (suggest some that fit the concept and background), and a drawback for a third?'],
    guide: 'Only if the table uses traits: skip it otherwise, completing it with that. Look each up (kind trait) and add it '
      + 'with create_feature in traits (drawbacks in drawbacks).',
    tools: ['create_feature'],
  },
  {
    id: 'equipment',
    title: 'Equipment',
    ask: [
      'Starting gold: the class\'s average, or roll it?',
      'What do you buy? (suggest a kit for the class and concept: weapons, armor, adventuring gear, within the gold)',
    ],
    guide: 'get_creation_status says the gold left. Add each item with create_item with its cost (it comes off the starting '
      + 'gold), equipping what the character uses. Look weapons and armor up for their numbers.',
    tools: ['create_item'],
  },
  {
    id: 'spells',
    title: 'Starting spells',
    ask: ['Which spells does the character know or have in the spellbook?'],
    guide: 'The AI can not add spells yet: tell the player to add them in the spells section of the sheet, and complete '
      + 'the step with the spells they chose.',
    tools: [],
    skip: service => !Object.keys(service.applied().spells || {}).length,
  },
  {
    id: 'details',
    title: 'Description and personality',
    ask: [
      'Name, age, height and weight?',
      'Alignment (within the class\'s limits) and deity?',
      'What do they look like, and a few words on their personality?',
    ],
    guide: 'Suggest what fits the concept for what the player leaves open, then set_character_details.',
    tools: ['set_character_details'],
    missing: service => service.raw().name && service.raw().name !== 'New Character' ? undefined : 'give the character a name',
  },
  {
    id: 'review',
    title: 'Review',
    ask: ['Here is the character (hit points, AC, saves, initiative, attacks, skills): anything to change?'],
    guide: 'Read get_character_summary and show what the sheet worked out, from it (never your own numbers). Completing '
      + 'this step ends the creation.',
    tools: [],
  },
];

const stepById = (id: string): CreationStep | undefined => CREATION_STEPS.find(step => step.id === id);

// the steps that apply to the character, from the one given on
const nextStep = (service: ApplyCharacterService, after: string): CreationStep | undefined => {
  const index = CREATION_STEPS.findIndex(step => step.id === after);
  return CREATION_STEPS.slice(index + 1).find(step => !step.skip?.(service));
};

// what the chat knows of the conversation: the player's messages so far, and the step whose questions the AI was
// last given, at which of them
export interface CreationConversation {
  playerTurns: number;
  asked?: {step: string, turn: number};
}

// the changes the creation holds back: a step's tools only at that step, and only once the player answered its
// questions (a message after the AI was given them). edits of what was added can be made at any step, once the player
// answered. undefined when the tool may run
export const creationGate = (
  progress: CreationProgress | undefined, tool: string, conversation: CreationConversation,
): string | undefined => {
  if (!progress) return undefined;
  const step = stepById(progress.step);
  if (!step) return undefined;
  const owner = CREATION_STEPS.find(s => s.tools.includes(tool));
  const isEdit = EDITS.includes(tool);
  if (!owner && !isEdit) return undefined;
  if (!isEdit && !step.tools.includes(tool)) {
    return `the character is being created and is at the step "${step.title}": ${tool} belongs to "${owner!.title}". `
      + 'Finish this step first (get_creation_step).';
  }
  const asked = conversation.asked;
  if (!asked || asked.step !== step.id || conversation.playerTurns <= asked.turn) {
    return `ask the player the questions of "${step.title}" first (get_creation_step), and wait for their answer before changing the character`;
  }
  return undefined;
};

const stepView = (step: CreationStep, progress: CreationProgress) => ({
  step: step.id, title: step.title, number: `${CREATION_STEPS.indexOf(step) + 1} of ${CREATION_STEPS.length}`,
  ask: step.ask, guide: step.guide, tools: step.tools,
  decidedSoFar: progress.decisions,
  howTo: 'Ask these questions now (skip what the player already answered, suggest answers from what they decided so '
    + 'far, and say why), then end your message and wait for their answer. Make the changes once they answered, then '
    + 'complete_creation_step with what they decided.',
});

// the step the creation is at, starting it for a character with no class level. what it gives is what the AI asks
export const getCreationStep = (service: ApplyCharacterService, conversation: CreationConversation): object => {
  let progress = service.raw().creation;
  if (!progress) {
    if (characterLevel(service.raw())) return {error: 'the character is not being created: it has class levels already'};
    progress = {step: CREATION_STEPS[0].id, decisions: {}};
    service.update({creation: progress});
  }
  const step = stepById(progress.step) || CREATION_STEPS[0];
  // reading the step again keeps when it was first asked: the player's answer since still counts
  if (conversation.asked?.step !== step.id) conversation.asked = {step: step.id, turn: conversation.playerTurns};
  return stepView(step, progress);
};

export const completeCreationStep = (
  service: ApplyCharacterService, conversation: CreationConversation, args: {[name: string]: unknown},
): ActionResult => {
  const progress = service.raw().creation;
  if (!progress) return {error: 'the character is not being created (get_creation_step starts it)'};
  const step = stepById(progress.step);
  if (!step) return {error: `unknown step ${progress.step}`};
  if (typeof args['step'] === 'string' && args['step'] !== step.id) {
    return {error: `the creation is at "${step.title}" (${step.id}), not ${args['step']}`};
  }
  const decided = typeof args['decisions'] === 'string' ? args['decisions'].trim() : '';
  if (!decided) return {error: 'decisions is what the player decided at this step, in a sentence or two'};
  const asked = conversation.asked;
  const answered = asked?.step === step.id && (step.answeredSoFar ? conversation.playerTurns >= 1 : conversation.playerTurns > asked.turn);
  if (!answered) return {error: `ask the player the questions of "${step.title}" first and wait for their answer`};
  const missing = step.missing?.(service);
  if (missing) return {error: `"${step.title}" is not done: ${missing}`};
  const next = nextStep(service, step.id);
  return service.labelled(`creation: ${step.title} done`, () => {
    const decisions = {...progress.decisions, [step.id]: decided};
    if (!next) {
      service.update({creation: undefined});
      return {done: `${step.title} done: the character is created`};
    }
    const now: CreationProgress = {step: next.id, decisions};
    service.update({creation: now});
    conversation.asked = {step: next.id, turn: conversation.playerTurns};
    return {done: `${step.title} done`, next: stepView(next, now)};
  });
};

// what base ability scores cost in a point buy, so the AI never prices them itself
export const pricePointBuy = (args: {[name: string]: unknown}): object => {
  let scores: {[ability: string]: unknown} = {};
  try {
    scores = typeof args['scores'] === 'string' ? JSON.parse(args['scores']) : (args['scores'] as {[a: string]: unknown}) || {};
  } catch (e) {
    return {error: `scores is not valid JSON: ${(e as Error).message}`};
  }
  const base = Object.fromEntries(ABILITIES.map(a => [a, Math.floor(Number(scores[a] ?? 10))]));
  const outside = ABILITIES.filter(a => POINT_BUY_COST[base[a]] === undefined);
  if (outside.length) return {error: `a point buy keeps scores between 7 and 18: ${outside.join(', ')}`};
  const total = pointBuyTotal(base);
  const budget = Math.floor(Number(args['budget']));
  return {
    costs: Object.fromEntries(ABILITIES.map(a => [a, `${base[a]} costs ${POINT_BUY_COST[base[a]]}`])),
    total,
    ...(budget > 0 ? {budget, left: budget - total, fits: total === budget} : {}),
    // what one step up or down costs, to fix a spread in one go
    nextStep: Object.fromEntries(ABILITIES.map(a => [a, {
      up: base[a] < 18 ? POINT_BUY_COST[base[a] + 1] - POINT_BUY_COST[base[a]] : null,
      down: base[a] > 7 ? POINT_BUY_COST[base[a]] - POINT_BUY_COST[base[a] - 1] : null,
    }])),
  };
};
