import type {CreationStep} from './creation-script';
import {Character} from '../utils/character.class';
import {masterClassLevel, owedCompanionIncreases} from '../rules/companions';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {availableFeats} from '../rules/class-progression';

// the scripts of creating a companion with the AI whose levels come from its master (rules/companions.ts), run by the
// creation's steps (creation-script.ts): the creature it is, which of its master's classes it comes from, its details.
// a cohort is a character, created by the creation's own script

export const FAMILIAR_STEPS: CreationStep[] = [
  {
    id: 'creature',
    title: 'The creature',
    ask: ['Which creature is the familiar? (suggest from the familiars its master\'s class can have: a cat, a raven, a toad, ...; an improved familiar needs the feat)'],
    guide: 'Look the familiar up (the familiar\'s page and its creature\'s, in the Bestiary), then set its creature: '
      + 'set_ability_scores with its scores as its stat block gives them (method "rolled"), and set_race with the creature '
      + 'as its racial stats (size and speeds with "mode": "set", its natural attacks as melee entries with "sizedFor" '
      + 'its size, its senses) and its special qualities as traits. Its hit points, attack bonus, saves, skills, natural '
      + 'armor, Int and familiar abilities come from its master: never write them. What it gives its master (a cat: +3 '
      + 'Stealth) goes on the master\'s sheet: tell the player to add it there.',
    tools: ['set_ability_scores', 'set_race'],
    completesWith: ['set_race'],
    answeredSoFar: true,
    missing: service => service.raw().race?.features?.length ? undefined : 'set the creature (set_race, with set_ability_scores)',
  },
  {
    id: 'grants',
    title: 'Its master\'s classes',
    ask: ['Which of its master\'s classes grant the familiar? (their levels stack for what it gets)'],
    guide: 'set_companion with the classes of the master that grant a familiar (an arcane bond, a witch\'s patron, a '
      + 'feat\'s): the app gives it what their levels stack to.',
    tools: ['set_companion'],
    completesWith: ['set_companion'],
    missing: service => masterClassLevel(service.raw().master) ? undefined : 'say which of the master\'s classes grant it (set_companion)',
    onSheet: service => masterClassLevel(service.raw().master) ? (service.raw().master!.classes || []).join(', ') : undefined,
  },
  {
    id: 'familiar-details',
    title: 'Name and looks',
    ask: ['Its name, and what it looks like?'],
    guide: 'set_character_details with its name and description.',
    tools: ['set_character_details'],
    completesWith: ['set_character_details'],
    missing: service => service.raw().name && service.raw().name !== 'New Character' ? undefined : 'give it a name',
  },
  {
    id: 'familiar-review',
    title: 'Review',
    ask: ['Here is the familiar: anything to change?'],
    guide: 'The familiar is done: read get_character_summary and show it (hit points, AC, saves, its abilities), from '
      + 'it, never your own numbers.',
    tools: [],
    ends: true,
  },
];

export const ANIMAL_COMPANION_STEPS: CreationStep[] = [
  {
    id: 'creature',
    title: 'The creature',
    ask: ['Which animal is it? (suggest from those its master\'s class can have: a wolf, a big cat, a horse, a bird, ...)'],
    guide: 'Look the animal companion up (its entry in the animal companion list, kind gear or by its link) and set its '
      + 'creature: set_ability_scores with its starting scores (method "rolled"), and set_race with its starting '
      + 'statistics as racial stats (size and speeds with "mode": "set", its natural armor {"value": 2, "type": "natural '
      + 'armor"}, its natural attacks as melee entries with "sizedFor" its size, its senses) and its special qualities as '
      + 'traits. Its 4th- or 7th-level advancement is a trait of its own with "atLevel": 4 (or 7): its new size set, its '
      + 'attacks, its ability score changes. Its Hit Dice, hit points, attack bonus, saves, skill ranks, feats, natural '
      + 'armor bonus, Str and Dex bonus, tricks and abilities come from its level: never write them.',
    tools: ['set_ability_scores', 'set_race'],
    completesWith: ['set_race'],
    answeredSoFar: true,
    missing: service => service.raw().race?.features?.length ? undefined : 'set the creature (set_race, with set_ability_scores)',
  },
  {
    id: 'grants',
    title: 'Its master\'s classes',
    ask: ['Which of its master\'s classes grant it, and at what level (a druid\'s at its druid level, a ranger\'s at its ranger level - 3)?'],
    guide: 'set_companion with the classes of the master that grant it and level_offset, what their class feature adds to '
      + 'their levels for its effective druid level (0 for a druid or hunter, -3 for a ranger): read the class feature.',
    tools: ['set_companion'],
    completesWith: ['set_companion'],
    missing: service => masterClassLevel(service.raw().master) ? undefined : 'say which of the master\'s classes grant it (set_companion)',
  },
  {
    id: 'companion-choices',
    title: 'Its choices',
    ask: ['Its ability score increases (at 4th, 9th, 14th, 19th level), skill ranks, feats and tricks?'],
    guide: 'get_level_up_status says its ranks and feats. Its increases go in set_companion increases; its skill ranks with '
      + 'set_skill_ranks (its class skills: Acrobatics, Climb, Escape Artist, Fly, Intimidate, Perception, Stealth, '
      + 'Survival, Swim; another only with Int 3 or more); its feats with create_feature (an animal\'s: Power Attack, '
      + 'Toughness, Weapon Focus with its natural attack, ...); the tricks it knows in its description (set_character_details).',
    tools: ['set_companion', 'set_skill_ranks', 'create_feature', 'set_character_details'],
    completesWith: ['set_skill_ranks', 'create_feature', 'set_companion'],
    missing: service => {
      const raw = service.raw();
      const applied = service.applied();
      const {available, spent} = skillRankBudget(applied);
      const feats = availableFeats(applied) - (applied.feats || []).length;
      const owed = owedCompanionIncreases(raw);
      const left = [...(available > spent ? [`${available - spent} skill ranks`] : []),
        ...(feats > 0 ? [`${feats} feat${feats > 1 ? 's' : ''}`] : []), ...(owed ? [`${owed} ability score increase${owed > 1 ? 's' : ''}`] : [])];
      return left.length ? `still to pick: ${left.join(', ')}` : undefined;
    },
  },
  {...FAMILIAR_STEPS[2], id: 'companion-details', ask: ['Its name, what it looks like, and the tricks it knows?']},
  {...FAMILIAR_STEPS[3], id: 'companion-review', ask: ['Here is the companion: anything to change?'],
    guide: 'The companion is done: read get_character_summary and show it (hit points, AC, attacks, saves, its abilities), '
      + 'from it, never your own numbers.'},
];

// a mount (a paladin's divine bond, a cavalier's mount): an animal companion at its class's level, with what that class
// feature adds to it or takes away, read from the class feature's text
export const MOUNT_STEPS: CreationStep[] = [
  ANIMAL_COMPANION_STEPS[0],
  {...ANIMAL_COMPANION_STEPS[1], ask: ['Which of its master\'s classes grant the mount, and at what level (a paladin\'s and a cavalier\'s at their class level)?']},
  {
    id: 'mount-abilities',
    title: 'What its class gives it',
    ask: ['Its class feature gives the mount more than an animal companion has (or takes some away): shall I read it and add it?'],
    guide: 'Look up the class feature granting the mount (a paladin\'s divine bond, a cavalier\'s mount) and add what it '
      + 'gives the mount beyond an animal companion\'s: each with create_feature in race.features (a trait of the mount, '
      + 'shown_in its section), at_level the level it comes at, its numbers as adjustments ({level} is the mount\'s own level: spell resistance of '
      + 'its paladin level + 11 is "spellResistance": {"value": "{level} + 11", "mode": "max"}; an Int of at least 6 is '
      + '"abilityScores.int": {"value": 6, "mode": "max"}). What it takes away (a cavalier\'s: share spells) goes in '
      + 'set_companion without. Complete the step when that is done, or at once when it gives nothing more.',
    tools: ['create_feature', 'set_companion'],
  },
  ...ANIMAL_COMPANION_STEPS.slice(2).map(step => step.id === 'companion-review'
    ? {...step, id: 'mount-review', ask: ['Here is the mount: anything to change?']} : step),
];

// an eidolon (the summoner's, the Unchained summoner's): its base form (and subtype), its summoner, its evolutions
export const EIDOLON_STEPS: CreationStep[] = [
  {
    id: 'creature',
    title: 'Base form',
    ask: ['Which summoner (the original or the Unchained), which base form (biped, quadruped, serpentine; aberrant for the Unchained), and for the Unchained which subtype?'],
    guide: 'Read the eidolon page (the summoner\'s or the unchained summoner\'s; look_up_rules with its url, or follow '
      + 'the class page\'s links). set_ability_scores with the base form\'s scores (method "rolled") and set_race with the '
      + 'base form as its racial stats (size and speeds with "mode": "set", "ac": {"value": 2, "type": "natural armor"}, '
      + 'its attacks as melee entries) and each free evolution as a trait with "cost": 0. An Unchained eidolon\'s '
      + 'subtype gives evolutions at set levels: each a trait with "cost": 0 and "at_level". Its Hit Dice, hit points, '
      + 'attack bonus, saves, skills, feats, armor bonus, Str/Dex bonus and abilities come from its level: never write them.',
    tools: ['set_ability_scores', 'set_race'],
    completesWith: ['set_race'],
    answeredSoFar: true,
    missing: service => service.raw().race?.features?.length ? undefined : 'set the base form (set_race, with set_ability_scores)',
  },
  {
    ...ANIMAL_COMPANION_STEPS[1],
    ask: ['It is the summoner\'s eidolon: anything else from its summoner (which summoner it is, its base form\'s good saves)?'],
    guide: 'set_companion with classes (the summoner class), unchained (true for the Unchained summoner\'s), synthesist '
      + '(true when its summoner is a synthesist, who fuses with it: the app gives the summoner its Fused form) and good_saves, '
      + 'those its base form makes good (biped fort, will; quadruped fort, ref; serpentine ref, will; aberrant fort, will).',
    missing: service => {
      const link = service.raw().master;
      return !masterClassLevel(link) ? 'say which of the summoner\'s classes grant it (set_companion)'
        : !(link?.goodSaves || []).length ? 'give its good saves (set_companion good_saves)' : undefined;
    },
  },
  {
    id: 'evolutions',
    title: 'Evolutions',
    ask: ['Which evolutions does it take with its evolution points? (say the points, and suggest some that fit)'],
    guide: 'get_character_summary has its pool (companionOf). Suggest evolutions from what you know; look up only those the '
      + 'player picks (the eidolon page lists them, with their costs) and add each with create_feature in race.features: '
      + '"cost" its points, its effect as adjustments (an attack as a melee entry, a speed set, an ability bonus), '
      + '"prerequisites" what it requires ("Limbs (Arms)", "Tail"), "at_level" the summoner level it needs. Every point '
      + 'is spent; its natural attacks stay within its most. The app warns of what is off.',
    tools: ['create_feature'],
    completesWith: ['create_feature'],
  },
  {...ANIMAL_COMPANION_STEPS[2], ask: ['Its ability score increases (at 5th, 10th and 15th), skill ranks (and the four class skills its summoner picks), and feats?'],
    guide: 'Its increases go in set_companion increases; the four class skills its summoner picks are one trait with '
      + '"skills.<skill>.classSkill": true for each (create_feature in race.features, cost left out); its skill ranks '
      + 'with set_skill_ranks; its feats with create_feature in feats.'},
  {...ANIMAL_COMPANION_STEPS[3], id: 'eidolon-details', ask: ['Its name and what it looks like?']},
  {...ANIMAL_COMPANION_STEPS[4], id: 'eidolon-review', ask: ['Here is the eidolon: anything to change?']},
];

export type CompanionScript = 'familiar' | 'animal companion' | 'mount' | 'eidolon';
export const COMPANION_STEPS: {[script in CompanionScript]: CreationStep[]} = {
  'familiar': FAMILIAR_STEPS, 'animal companion': ANIMAL_COMPANION_STEPS, 'mount': MOUNT_STEPS, 'eidolon': EIDOLON_STEPS,
};

// the script a companion is created by, undefined for a character (and a cohort) created by the creation's own
export const companionScriptOf = (raw: Pick<Character, 'master'>): CompanionScript | undefined =>
  raw.master && raw.master.kind !== 'cohort' ? raw.master.kind : undefined;
