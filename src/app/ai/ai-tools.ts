import {parseJsonList} from './json-arg';
import {priceInGp} from '../utils/wealth.util';
import {craftQuote} from '../rules/crafting';
import {rechargeStaff, useSpellItem} from '../spell-items';
import {setCompanion} from '../party/companion-actions';
import {retrain} from './retrain';
import {RETRAIN_KINDS, RETRAINING_RULES_URL} from '../rules/retraining';
import {removeLastClassLevel} from '../retraining';
import {ARCHETYPE_FORM} from './archetypes';
import {ApplyCharacterService} from '../apply-character.service';
import {adjustmentReference} from '../rules/adjustment-reference';
import {AiProvider, AiToolDeclaration} from './ai-provider';
import {basedOnKinds, createFeature, createItem, createItems, featureLists, itemTypes, slots} from './builders';
import {editFeature, editItem, removeFeature, removeItem} from './editors';
import {addClassLevel, chooseAbilityIncrease, levelUpStatus, setFavoredClassBonus, setSkillRanks} from './level-up';
import {creationStatus, priceGear, setAbilityScores, setCharacterDetails, setRace} from './creation';
import {CREATION_STEPS, CreationConversation, completeCreationStep, getCreationStep, getLevelUpStep, offerPointBuy} from './creation-script';
import {lookUpRule, ruleKinds} from './rules-lookup';
import {addSpells, changeCasterChoices, prepareSpells, removeSpells, setClassSpellcasting} from './spells';
import {characterSummary, explainAttack, explainStat, findFeature, findItem} from './character-reader';
import {
  addCondition, castSpell, heal, removeCondition, rest, setCombatOption, setFeatureActive, takeDamage, undoLast, useCharges,
} from './play-actions';

// the tools the AI can call, whichever provider runs it. each one is a declaration the AI reads and a function the
// app runs in the browser. the AI never works a number out itself, it asks the engine, which is what the sheet shows.
// the reading tools only read, the play actions (play-actions.ts) change the character, each one a step of the undo
// history the chat offers to take back

export interface AiToolContext {
  character: ApplyCharacterService;
  // the AI itself, for the tools that ask it something of their own (reading a rules page)
  provider?: AiProvider | null;
  // the conversation, for the creation script: the player's messages and the step last asked
  conversation?: CreationConversation;
}

export interface AiTool extends AiToolDeclaration {
  // what the chat shows while the tool runs ("looking up AC")
  label(args: {[name: string]: unknown}): string;
  // the tool changes the character (a play action): the chat shows what it did, with an undo
  changes?: boolean;
  run(args: {[name: string]: unknown}, context: AiToolContext): object | Promise<object>;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

// a part of the adjustment reference: it is long, and what the AI reads stays in the conversation it sends each time
export const referenceTopic = (topic: string): object => {
  const sections = adjustmentReference().split(/\n(?=## )/);
  const titled = (title: string) => sections.filter(section => section.startsWith(`## ${title}`));
  const parts: {[topic: string]: string[]} = {
    rules: [sections[0], ...titled('Adjustments')],
    paths: titled('What can be adjusted'),
    examples: titled('Examples'),
    all: sections,
  };
  if (!parts[topic]) return {error: `topic is one of ${Object.keys(parts).join(', ')}`};
  return {reference: parts[topic].join('\n'), ...(topic === 'all' ? {} : {otherTopics: Object.keys(parts).filter(t => t !== topic)})};
};
const named = (what: string) => ({type: 'object' as const, properties: {name: {type: 'string' as const, description: what}}, required: ['name']});

// the look_up_rules calls of the player's turn (several names in one call are one call)
const LOOKUPS_A_TURN = 6;
const lookupBudget = {turn: -2, calls: 0};

export const aiTools: AiTool[] = [
  {
    name: 'get_character_summary',
    description: 'The sheet in short, every number final: race, classes, ability scores, hp, AC, saves, attacks, '
      + 'trained skills, active conditions and features, defenses, spells per day. Call it first, and again after the '
      + 'player changed the character.',
    label: () => 'reading the sheet',
    run: (_, {character}) => characterSummary(character),
  },
  {
    name: 'explain_stat',
    description: 'Where a number of the sheet comes from, as its tooltip shows it: each bonus and penalty with its '
      + 'feature and type, those that do not stack, and situational ones (vs. fear). For "why is my AC 17".',
    parameters: {
      type: 'object',
      properties: {
        stat: {
          type: 'string',
          description: 'ac, touchAc, flatFootedAc, init, hp, bab, cmb, cmd, saves.fort, saves.ref, saves.will, '
            + 'speed.land, abilityScores.str (or another ability), maxDexBonus, armorCheckPenalty, '
            + 'spellFailureChance, or a skill by name: stealth, knowledge (arcana), sense motive',
        },
      },
      required: ['stat'],
    },
    label: args => `looking up ${text(args['stat']) || 'a stat'}`,
    run: (args, {character}) => explainStat(character, text(args['stat'])),
  },
  {
    name: 'explain_attack',
    description: 'What makes up an attack of the character: its attack bonuses (iteratives included), each part of '
      + 'the attack bonus and the damage with where it comes from, the critical range and notes.',
    parameters: {
      type: 'object',
      properties: {name: {type: 'string', description: 'the name of the attack, as in the summary (Greataxe, Bite)'}},
      required: ['name'],
    },
    label: args => `looking up the ${text(args['name']) || 'attack'}`,
    run: (args, {character}) => explainAttack(character, text(args['name'])),
  },
  {
    name: 'get_feature',
    description: 'A feature of the character by name (feat, class feature, racial trait, item feature, condition): '
      + 'its description, adjustments and where it comes from.',
    parameters: {
      type: 'object',
      properties: {name: {type: 'string', description: 'the name of the feature (Rage, Power Attack, Fatigued)'}},
      required: ['name'],
    },
    label: args => `reading ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => findFeature(character, text(args['name'])),
  },
  {
    name: 'get_item',
    description: 'An item of the inventory by name, equipped or not: its slot, weight, cost, description and the '
      + 'features it gives while equipped, with their adjustments.',
    parameters: named('the item'),
    label: args => `reading ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => findItem(character, text(args['name'])),
  },
  {
    name: 'get_adjustment_reference',
    description: 'How features adjust the character, by topic: rules (the shape of a feature, modes, bonus types, '
      + 'formulas, variants: read it before building), paths (everything that can be adjusted), examples (whole '
      + 'features), or all. Read only the topic you need. A wrong path is refused with the closest right one.',
    parameters: {
      type: 'object',
      properties: {topic: {type: 'string', enum: ['rules', 'paths', 'examples', 'all'], description: 'rules when left out'}},
    },
    label: args => `reading how features work${text(args['topic']) && text(args['topic']) !== 'rules' ? ` (${text(args['topic'])})` : ''}`,
    run: args => referenceTopic(text(args['topic']) || 'rules'),
  },

  // play actions: they change the character at once, the player can undo each one
  {
    name: 'take_damage',
    description: 'The character takes damage: temporary hit points go first, then hit points (or nonlethal damage). '
      + 'Gives the hit points before and after and the conditions the character is under now (disabled, dying).',
    parameters: {
      type: 'object',
      properties: {
        amount: {type: 'integer', description: 'the damage, after the player rolled it and took off damage reduction or resistance'},
        nonlethal: {type: 'boolean', description: 'true for nonlethal damage'},
      },
      required: ['amount'],
    },
    changes: true,
    label: args => `taking ${args['amount']} damage`,
    run: (args, {character}) => takeDamage(character, args['amount'], args['nonlethal'] === true),
  },
  {
    name: 'heal',
    description: 'The character heals hit points (a cure spell, a potion), up to its maximum. It heals as much '
      + 'nonlethal damage too.',
    parameters: {type: 'object', properties: {amount: {type: 'integer', description: 'the hit points healed'}}, required: ['amount']},
    changes: true,
    label: args => `healing ${args['amount']}`,
    run: (args, {character}) => heal(character, args['amount']),
  },
  {
    name: 'add_condition',
    description: 'Puts the character under a condition of the rules (Shaken, Fatigued, Prone, Grappled, ...), with '
      + 'everything it does to the numbers. An error lists the conditions there are.',
    parameters: named('the condition, as the rules name it'),
    changes: true,
    label: args => `adding ${text(args['name'])}`,
    run: (args, {character}) => addCondition(character, args['name']),
  },
  {
    name: 'remove_condition',
    description: 'Ends a condition the character is under. Conditions from the rules (dying from hit points, '
      + 'staggered from nonlethal damage) end when what causes them changes, not with this.',
    parameters: named('the condition'),
    changes: true,
    label: args => `removing ${text(args['name'])}`,
    run: (args, {character}) => removeCondition(character, args['name']),
  },
  {
    name: 'set_feature_active',
    description: 'Turns a feature of the character that can be turned on and off on or off (Rage, a buff the '
      + 'player keeps on the sheet). Turning on does not spend a use, call use_feature for that. An error lists the '
      + 'features that turn on and off.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the feature'},
        active: {type: 'boolean', description: 'true to turn it on, false to turn it off'},
      },
      required: ['name', 'active'],
    },
    changes: true,
    label: args => `turning ${text(args['name'])} ${args['active'] === false ? 'off' : 'on'}`,
    run: (args, {character}) => setFeatureActive(character, args['name'], args['active']),
  },
  {
    name: 'use_feature',
    description: 'Spends uses of a feature with uses per day (rages, channel energy, a wand\'s charges). An error '
      + 'lists the features with uses and how many are left.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the feature'},
        uses: {type: 'integer', description: 'how many uses to spend, 1 when left out'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `using ${text(args['name'])}`,
    run: (args, {character}) => useCharges(character, args['name'], args['uses']),
  },
  {
    name: 'set_combat_option',
    description: 'Turns a combat option on or off: Power Attack, Deadly Aim, Two-Weapon Fighting, Fighting '
      + 'Defensively, Total Defense, Combat Expertise. The character needs a feat for most of them.',
    parameters: {
      type: 'object',
      properties: {
        option: {type: 'string', description: 'the option, as named above'},
        on: {type: 'boolean', description: 'true to turn it on, false to turn it off'},
      },
      required: ['option', 'on'],
    },
    changes: true,
    label: args => `${args['on'] === false ? 'turning off' : 'turning on'} ${text(args['option'])}`,
    run: (args, {character}) => setCombatOption(character, args['option'], args['on']),
  },
  {
    name: 'cast_spell',
    description: 'Casts a spell the character knows or prepared: spends its slot (or the prepared spell), rolls '
      + 'spell failure where it applies, and with on_self puts the spell\'s adjustments on the character. Name the '
      + 'caster or the level only when the spell is known more than once.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the spell'},
        caster: {type: 'string', description: 'the caster it is cast as (cleric, sorcerer), when it is known by more than one'},
        level: {type: 'integer', description: 'the spell level, when it is known at more than one'},
        on_self: {type: 'boolean', description: 'true when the character is a target and the spell changes its numbers (Bless, Shield, Bull\'s Strength)'},
        metamagic: {type: 'string', description: 'metamagic feats it is cast with, comma separated: a spontaneous caster\'s raise the slot it spends (a full-round action); a prepared caster\'s must be those it was prepared with'},
        heightened_to: {type: 'integer', description: 'with Heighten Spell: the spell level it is heightened to'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `casting ${text(args['name'])}`,
    run: (args, {character}) => castSpell(character, args['name'], {caster: args['caster'], level: args['level'], onSelf: args['on_self'],
      metamagic: args['metamagic'], heightenedTo: args['heightened_to']}),
  },
  {
    name: 'rest',
    description: 'The character rests: a night (8 hours) or a full day of bed rest. Heals, gives back spell slots and '
      + 'uses per day, ends fatigue. Gives what came back.',
    parameters: {
      type: 'object',
      properties: {kind: {type: 'string', enum: ['night', 'bed rest'], description: 'night, or bed rest for a full day'}},
    },
    changes: true,
    label: () => 'resting',
    run: (args, {character}) => rest(character, args['kind']),
  },

  // building: looking a rule up, then adding what it describes
  {
    name: 'look_up_rules',
    description: 'Reads a rule from aonprd.com or d20pfsrd.com: a feat, spell, trait, class (its table and class '
      + 'features), race, archetype, item, or a class option (mystery, curse, revelation, bloodline, domain, arcane school, '
      + 'hex, rage power, rogue talent, discovery): its rules, its page, and the links of the page to other rules. Only '
      + 'for a rule the player asks about or one about to be added, never to make suggestions; several at once with '
      + 'names. A name tries the Archives of Nethys pages of its kind (exact names work best; a revelation needs within, '
      + 'its mystery); a url reads any page of those sites, a link a lookup gave included: follow the links to reach a '
      + 'rule no name finds (a class page links its mysteries, a mystery its revelations). Magic items need a url. It '
      + 'can not search: when neither names nor links reach it, ask the player for a link.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the name as the rules write it (Power Attack, Cloak of Resistance, Barbarian); an archetype with its class first (Barbarian Invulnerable Rager)'},
        names: {type: 'string', description: 'several rules of the same kind to read at once, comma separated ("Greataxe, Hide Armor"): one call for all of them'},
        kind: {type: 'string', enum: [...ruleKinds], description: 'what it is, when known: narrows the pages tried'},
        url: {type: 'string', description: 'a link to its page on aonprd.com or d20pfsrd.com, when the player gave one'},
        focus: {type: 'string', description: 'for a long page (a class), the part you need: "the table row and class features of level 2"'},
        within: {type: 'string', description: 'the rule a revelation belongs to: its mystery ("Flame")'},
      },
    },
    label: args => `looking up ${text(args['names']) || text(args['name']) || text(args['url']) || 'the rules'}`,
    run: async (args, {provider, conversation}) => {
      // a turn of lookups one name at a time is a search by guessing (thirty traits read to find one that gives AC,
      // the chat stopped twice): past the budget, the AI is told how to find a rule by what it does
      const turn = conversation?.playerTurns ?? -1;
      if (lookupBudget.turn !== turn) Object.assign(lookupBudget, {turn, calls: 0});
      if (++lookupBudget.calls > LOOKUPS_A_TURN) {
        return {error: `${LOOKUPS_A_TURN} lookups this turn already: stop guessing names. To find a rule by what it does `
          + '(a trait that raises AC), read its list page once with focus, a link a lookup gave ("Combat Traits": '
          + 'https://aonprd.com/Traits.aspx?Type=Combat, focus "traits that give a bonus to AC"), or ask the player '
          + 'which they want. Build what you have read now'};
      }
      // several names read at once, the pages of each in parallel: one round of the chat for all of them
      const names = (Array.isArray(args['names']) ? args['names'].map(String) : String(args['names'] ?? '').split(','))
        .map(n => n.trim()).filter(Boolean);
      if (names.length < 2) return lookUpRule(provider, names.length ? {...args, name: names[0]} : args);
      const results = await Promise.all(names.slice(0, 10).map(async name => ({name, ...(await lookUpRule(provider, {...args, name}))})));
      return {results, ...(names.length > 10 ? {note: 'only the first 10 were read'} : {})};
    },
  },
  {
    name: 'create_feature',
    description: 'Builds a feature from its rules text or the player\'s description and adds it: a condition or '
      + 'buff (Bless, a GM ruling), feat, trait, drawback or special ability. Its adjustments are what the engine '
      + 'applies (get_adjustment_reference). A plain path applies always; a bonus only in a situation is a variant, '
      + 'path[situation]: Improved Grapple is {"cmb[grapple]": 2, "cmd[grapple]": 2}, never {"cmb": 2}; Weapon Focus '
      + '(longsword) {"melee.@longsword.toHitBonus": 1}. A form the character changes into (a polymorph spell, wild '
      + 'shape) is a condition with form, its adjustments what the spell gives at that size (size {"value": 5, "mode": '
      + '"set"}, size bonuses to abilities, natural armor) and what the creature has that the spell allows (its natural '
      + 'attacks with "sizedFor" the creature\'s size, speeds, senses): switched on with set_feature_active. One the player switches on while it applies (a stance, a buff '
      + 'kept up) is can_turn_off with plain paths. A feature that changes no number needs description_only. Checked '
      + 'first: on problems nothing is added, fix them and call again.',
    parameters: {
      type: 'object',
      properties: {
        list: {type: 'string', enum: [...featureLists], description: 'where it goes: conditions for temporary effects and buffs'},
        name: {type: 'string'},
        description: {type: 'string', description: 'what it does, in short, as the sheet shows it'},
        adjustments: {type: 'string', description: 'a JSON object, {"attackRollBonus": {"value": 1, "type": "morale"}}'},
        uses_total: {type: 'integer', description: 'uses per day or encounter'},
        grows: {type: 'string', description: 'a number that grows with the character\'s level, as the rules list it, never a formula of your own: a JSON object of the adjustment path and its value by level, {"hp": {"1": 3, "4": 4, "5": 5}}; the app writes the formula'},
        uses_label: {type: 'string', description: 'rounds per day, uses per day, ...'},
        uses_per: {type: 'string', enum: ['day', 'encounter', 'none']},
        can_turn_off: {type: 'boolean', description: 'the player turns it on and off; conditions always can'},
        description_only: {type: 'string', description: 'only when it changes no number: why'},
        spell_like_abilities: {type: 'string', description: 'the spell-like abilities it gives (a racial or class "spell-like ability"), a JSON array: [{"name": "Darkness", "level": 2, "uses": 1, "school": "evocation", "components": "V, M/DF", "range": "touch", "duration": "1 min./level", "saving_throw": "none", "spell_resistance": "no", "description": "..."}], "uses": "at will" for one at will'},
        spell_like_ability: {type: 'string', description: 'with spell_like_abilities: the ability their DCs use, cha when its text names none'},
        spell_like_caster_level: {type: 'string', description: 'with spell_like_abilities: "level" when their caster level is the character\'s level (most racial ones), else a number'},
        shown_in: {type: 'string', enum: ['specialAttack', 'defensiveAbilities', 'specialQuality', 'hidden'], description: 'a racial trait (race.features): the section of the sheet it is listed in'},
        metamagic_levels: {type: 'integer', description: 'a metamagic feat: the spell levels it adds to a spell\'s slot, from its page (Empower Spell 2, Quicken Spell 4)'},
        heightens: {type: 'boolean', description: 'a metamagic feat that raises the spell\'s own level to its slot\'s (Heighten Spell)'},
        cost: {type: 'integer', description: 'a racial trait that is an eidolon\'s evolution: its points from the evolution pool (0 for its base form\'s free ones)'},
        at_level: {type: 'integer', description: 'the level it applies from (a companion\'s own level: a mount\'s ability from 11th), left out for always'},
        form: {type: 'string', description: 'a form the character changes into, in conditions: a JSON object, {"melds_gear": true (an animal, elemental, plant, dragon or vermin form: armor, shields and weapons stop), "no_casting": true (no hands or voice for spells), "from": "Beast Shape II"}; {} for a humanoid form (alter self)'},
        prerequisites: {type: 'string', description: 'a feat\'s prerequisites as its page lists them ("Cha 13, base attack bonus +1, Power Attack", or "none"): checked against the sheet'},
        based_on: {type: 'string', enum: [...basedOnKinds], description: 'looked up (with source_url), the player\'s description, or own knowledge (the player is told to check it)'},
        source_url: {type: 'string'},
      },
      required: ['list', 'name', 'adjustments', 'based_on'],
    },
    changes: true,
    label: args => `building ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => createFeature(character, args),
  },
  {
    name: 'create_item',
    description: 'Builds an item and adds it to the inventory: gear, weapon, armor, shield or magic item. What it does '
      + 'goes in its features, applied while equipped: a weapon\'s attack is made from damage, critical and attack_kind '
      + '(features "[]" then; ammunition is type other), armor {"ac": {"value": 4, "type": "armor"}, "maxDexBonus": {"value": 3, "mode": "min"}, '
      + '"armorCheckPenalty": -4, "arcaneSpellFailureChance": 25}. Checked like create_feature.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', enum: [...itemTypes]},
        description: {type: 'string'},
        slot: {type: 'string', enum: slots, description: 'held for what is held in the hands'},
        features: {type: 'string', description: 'a JSON array, [{"name": "...", "adjustments": {...}}], "[]" for plain gear'},
        weight: {type: 'number', description: 'the weight of one piece in pounds, as its page gives it (a weapon or armor\'s for a Medium creature: the app sizes it for a Small or Large character); ammunition sold by the bundle is the bundle\'s weight over its count (10 bolts, 1 lb.: 0.1)'},
        cost_gp: {type: 'string', description: 'the price of one in gp: quantity multiplies it. 1 gp = 10 sp = 100 cp, so 5 sp is 0.5 and 2 cp 0.02 (\"5 sp\" works too)'},
        quantity: {type: 'integer'},
        handedness: {type: 'string', enum: ['light', 'one-handed', 'two-handed'], description: 'a melee weapon: how it is held, as its page\'s weapon table heads it (needed)'},
        hands: {type: 'integer', description: 'hands it takes while held: 2 for a two-handed weapon (its page\'s two-handed melee: greataxe, greatsword), whose damage takes 1 1/2 times Strength'},
        proficiency: {type: 'string', description: 'simple, martial or exotic for a weapon'},
        damage: {type: 'string', description: 'a weapon: its damage dice for a medium wielder, "1d8" (its attack is made from these, no features needed)'},
        critical: {type: 'string', description: 'a weapon: "19-20/x2", "x3"'},
        attack_kind: {type: 'string', enum: ['melee', 'ranged', 'thrown'], description: 'a weapon: how it attacks'},
        damage_type: {type: 'string', description: 'a weapon: B, P, S or "P or S"'},
        weapon: {type: 'string', description: 'a weapon: the kind of weapon it is as the rules name it, when its name is not just that ("longsword" for a +1 cold iron longsword or a named blade): what a bonus for one weapon (Weapon Focus) matches'},
        weapon_groups: {type: 'string', description: 'a weapon: its weapon groups from its page or the fighter\'s weapon training list ("heavy blades"; "bows"; "close, natural"): what a bonus for a group matches'},
        range: {type: 'integer', description: 'a weapon: its range increment in feet'},
        armor_category: {type: 'string', enum: ['light', 'medium', 'heavy'], description: 'armor: its category on its page (needed)'},
        casts: {type: 'string', description: 'a wand, scroll, staff or potion: what it casts, a JSON object {"kind": "wand", "charges": 50, "charges_left": 37, "spells": [{"name": "Cure Light Wounds", "level": 1, "caster_level": 1, "school": "conjuration", "components": "V, S", "saving_throw": "Will half (harmless)", "spell_resistance": "yes (harmless)", "description": "...", "charges_per_use": 1}]}; a scroll or potion is used up (quantity), a wand 50 charges new, a staff 10'},
        shield_category: {type: 'string', enum: ['buckler', 'light', 'heavy', 'tower']},
        equip: {type: 'boolean', description: 'equip it as it is added'},
        based_on: {type: 'string', enum: [...basedOnKinds], description: 'as for create_feature'},
        source_url: {type: 'string'},
      },
      required: ['name', 'type', 'features', 'based_on'],
    },
    changes: true,
    label: args => `building ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => createItem(character, args),
  },
  {
    name: 'craft_item',
    description: 'The character makes a magic item (Core Rulebook, creating magic items): builds it as create_item does '
      + '(cost_gp its market price, casts for a wand, scroll, staff or potion) and adds it, and says what making it takes: '
      + 'half its base price in materials, the days, the Spellcraft DC (5 + its caster level, +5 for each requirement '
      + 'missing). Never refused for the rules: tell the player, the chat offers a Pay button for the gold.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        type: {type: 'string', enum: [...itemTypes]},
        description: {type: 'string'},
        slot: {type: 'string', enum: slots, description: 'held for what is held in the hands'},
        features: {type: 'string', description: 'a JSON array, [{"name": "...", "adjustments": {...}}], "[]" for plain gear'},
        weight: {type: 'number', description: 'the weight of one piece in pounds, as its page gives it (a weapon or armor\'s for a Medium creature: the app sizes it for a Small or Large character); ammunition sold by the bundle is the bundle\'s weight over its count (10 bolts, 1 lb.: 0.1)'},
        cost_gp: {type: 'string', description: 'the price of one in gp: quantity multiplies it. 1 gp = 10 sp = 100 cp, so 5 sp is 0.5 and 2 cp 0.02 (\"5 sp\" works too)'},
        quantity: {type: 'integer'},
        handedness: {type: 'string', enum: ['light', 'one-handed', 'two-handed'], description: 'a melee weapon: how it is held, as its page\'s weapon table heads it (needed)'},
        hands: {type: 'integer', description: 'hands it takes while held: 2 for a two-handed weapon (its page\'s two-handed melee: greataxe, greatsword), whose damage takes 1 1/2 times Strength'},
        proficiency: {type: 'string', description: 'simple, martial or exotic for a weapon'},
        damage: {type: 'string', description: 'a weapon: its damage dice for a medium wielder, "1d8" (its attack is made from these, no features needed)'},
        critical: {type: 'string', description: 'a weapon: "19-20/x2", "x3"'},
        attack_kind: {type: 'string', enum: ['melee', 'ranged', 'thrown'], description: 'a weapon: how it attacks'},
        damage_type: {type: 'string', description: 'a weapon: B, P, S or "P or S"'},
        weapon: {type: 'string', description: 'a weapon: the kind of weapon it is as the rules name it, when its name is not just that ("longsword" for a +1 cold iron longsword or a named blade): what a bonus for one weapon (Weapon Focus) matches'},
        weapon_groups: {type: 'string', description: 'a weapon: its weapon groups from its page or the fighter\'s weapon training list ("heavy blades"; "bows"; "close, natural"): what a bonus for a group matches'},
        range: {type: 'integer', description: 'a weapon: its range increment in feet'},
        armor_category: {type: 'string', enum: ['light', 'medium', 'heavy'], description: 'armor: its category on its page (needed)'},
        casts: {type: 'string', description: 'a wand, scroll, staff or potion: what it casts, a JSON object {"kind": "wand", "charges": 50, "charges_left": 37, "spells": [{"name": "Cure Light Wounds", "level": 1, "caster_level": 1, "school": "conjuration", "components": "V, S", "saving_throw": "Will half (harmless)", "spell_resistance": "yes (harmless)", "description": "...", "charges_per_use": 1}]}; a scroll or potion is used up (quantity), a wand 50 charges new, a staff 10'},
        shield_category: {type: 'string', enum: ['buckler', 'light', 'heavy', 'tower']},
        equip: {type: 'boolean', description: 'equip it as it is added'},
        based_on: {type: 'string', enum: [...basedOnKinds], description: 'as for create_feature'},
        source_url: {type: 'string'},
        feat: {type: 'string', description: 'the item creation feat that makes it, as its page names it (Craft Wondrous Item, Craft Wand, Scribe Scroll)'},
        caster_level: {type: 'integer', description: 'its caster level'},
        missing_requirements: {type: 'integer', description: 'how many of its requirements (spells, a caster level) the crafter lacks, besides the feat'},
        masterwork_cost: {type: 'number', description: 'a magic weapon or armor: the masterwork part of its price, paid in full'},
      },
      required: ['name', 'type', 'features', 'based_on'],
    },
    changes: true,
    label: args => `crafting ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => character.labelled(`craft ${text(args['name'])}`, () => {
      const made = createItem(character, args) as {done?: string};
      if (!made.done) return made;
      const kind = text((parseJsonList(args['casts'], 'casts').value as {kind?: unknown} | undefined)?.kind as string);
      const quote = craftQuote(character.raw(), {price: priceInGp(args['cost_gp']) || 0, masterwork: Number(args['masterwork_cost']) || 0,
        casterLevel: Number(args['caster_level']) || 1, missing: Number(args['missing_requirements']) || 0,
        brewedOrScribed: kind === 'potion' || kind === 'scroll', feat: text(args['feat'])});
      return {...made, craft: quote, pay: {gp: quote.cost, what: `crafting ${text(args['name'])}`},
        tell: `Tell the player: ${quote.cost} gp of materials, ${quote.time}, Spellcraft DC ${quote.dc} (${quote.notes.join('; ')}); the Pay button takes the gold`};
    }),
  },

  // spells: the casters' lists, their prepared spells and their choices
  {
    name: 'add_spells',
    description: 'Adds spells to a caster of the character: the spells a spontaneous caster knows (up to its spells '
      + 'known), a wizard\'s spellbook, the spells a prepared caster prepares from. Look each up first (look_up_rules '
      + 'with names, kind spell) or say based_on own knowledge. Checked against the levels the caster casts and what it '
      + 'knows; on problems nothing is added. A prepared caster then prepares the day\'s spells with prepare_spells.',
    parameters: {
      type: 'object',
      properties: {
        caster: {type: 'string', description: 'the caster: its class (wizard, oracle), when the character has more than one'},
        spells: {type: 'string', description: 'a JSON array of the spells, each from its page: [{"name": "Magic Missile", "level": 1, "school": "evocation", "descriptors": "force", "casting_time": "1 standard action", "components": "V, S", "range": "medium (100 ft. + 10 ft./level)", "target": "up to five creatures", "duration": "instantaneous", "saving_throw": "none", "spell_resistance": "yes", "description": "1d4+1 force damage per missile, 1 missile per 2 levels above 1st (max 5)"}]. level is its level for this caster\'s class; "domain" for a domain spell; "adjustments" for what it does to the numbers of a target it buffs ({"ac": {"value": 4, "type": "armor"}} for mage armor), so casting it on the character applies them'},
        kind: {type: 'string', enum: ['spells', 'spell-like'], description: 'spells unless the caster is one of spell-like abilities'},
        based_on: {type: 'string', enum: ['looked up', 'player description', 'own knowledge'], description: 'as for create_feature'},
        source_url: {type: 'string', description: 'the page, for a single spell looked up'},
      },
      required: ['spells', 'based_on'],
    },
    changes: true,
    label: args => `adding spells${text(args['caster']) ? ` to ${text(args['caster'])}` : ''}`,
    run: (args, {character}) => addSpells(character, args),
  },
  {
    name: 'prepare_spells',
    description: 'Prepares spells into the slots of a prepared caster (wizard, cleric, druid) for the day: the spells '
      + 'of one level, a name twice to prepare it twice. slot extra fills the domain or school slot. A spell of an '
      + 'opposition school takes two slots. Spontaneous casters prepare nothing.',
    parameters: {
      type: 'object',
      properties: {
        caster: {type: 'string', description: 'the caster, when there is more than one'},
        level: {type: 'integer', description: 'the spell level'},
        spells: {type: 'string', description: 'the names to prepare, comma separated, from the caster\'s list at that level'},
        slot: {type: 'string', enum: ['regular', 'extra'], description: 'extra for the domain or school slot'},
        replace: {type: 'boolean', description: 'empty the level\'s slots first (a new day\'s choice)'},
        metamagic: {type: 'string', description: 'metamagic feats to prepare the spells with, comma separated: level is then the raised slot\'s level (Empowered Fireball: level 5), the spells from their own level\'s list'},
      },
      required: ['level', 'spells'],
    },
    changes: true,
    label: args => `preparing ${text(args['spells']) || 'spells'}`,
    run: (args, {character}) => prepareSpells(character, args),
  },
  {
    name: 'remove_spells',
    description: 'Takes spells off a caster\'s list (a spell known swapped at a new level), and out of its slots.',
    parameters: {
      type: 'object',
      properties: {
        caster: {type: 'string'},
        spells: {type: 'string', description: 'the names, comma separated'},
        level: {type: 'integer', description: 'the spell level, when the name is on more than one'},
        kind: {type: 'string', enum: ['spells', 'spell-like']},
      },
      required: ['spells'],
    },
    changes: true,
    label: args => `removing ${text(args['spells']) || 'spells'}`,
    run: (args, {character}) => removeSpells(character, args),
  },
  {
    name: 'set_caster_choices',
    description: 'Sets or changes what a caster picked: a specialist wizard\'s school and opposition schools, a '
      + 'cleric\'s domains. They decide its extra slot and the spells that take two slots.',
    parameters: {
      type: 'object',
      properties: {
        caster: {type: 'string'},
        school: {type: 'string', description: 'a school of magic, or universalist'},
        opposition_schools: {type: 'string', description: '"enchantment, necromancy"'},
        domains: {type: 'string', description: '"Fire, Sun"'},
      },
    },
    changes: true,
    label: () => 'setting the caster\'s choices',
    run: (args, {character}) => changeCasterChoices(character, args),
  },
  {
    name: 'set_class_spellcasting',
    description: 'Gives a class the character has its spellcasting (every level of it), when it was added without it '
      + 'or its table was read wrong: the same spellcasting add_class_level takes, from the class page.',
    parameters: {
      type: 'object',
      properties: {
        class_name: {type: 'string'},
        spellcasting: {type: 'string', description: 'as for add_class_level'},
        school: {type: 'string'}, opposition_schools: {type: 'string'}, domains: {type: 'string'},
      },
      required: ['class_name', 'spellcasting'],
    },
    changes: true,
    label: args => `giving ${text(args['class_name']) || 'a class'} its spells`,
    run: (args, {character}) => setClassSpellcasting(character, args),
  },

  // creating a character, step by step (creation-script.ts)
  {
    name: 'get_creation_step',
    description: 'The creation step the character is at (starting it): its questions, how to help, its tools and '
      + 'what was decided so far. Call it once to start: complete_creation_step gives each next step. Its changes are '
      + 'refused until the player answered (or player_answer quotes their earlier words).',
    label: () => 'reading the next step',
    run: (_, {character, conversation}) => getCreationStep(character, conversation ?? {playerTurns: 0}),
  },
  {
    name: 'complete_creation_step',
    description: 'Completes the creation step once the player answered and its changes are made, with what the player '
      + 'decided (the next steps read it to suggest from). Gives the next step to ask about: do not read it again.',
    parameters: {
      type: 'object',
      properties: {
        step: {type: 'string', description: 'the id of the step being completed'},
        decisions: {type: 'string', description: 'what the player decided at this step, in a sentence or two'},
      },
      required: ['step', 'decisions'],
    },
    changes: true,
    label: () => 'completing the step',
    run: (args, {character, conversation}) => completeCreationStep(character, conversation ?? {playerTurns: 0}, args),
  },
  {
    name: 'offer_point_buy',
    description: 'For a point buy: shows the player your suggested base ability scores (before the race) in the chat, '
      + 'to change and confirm there; the app sets them and completes the step. Call it once: give the scores you or '
      + 'the player have in mind, and raise and lower to fill the rest to the points.',
    parameters: {
      type: 'object',
      properties: {
        budget: {type: 'integer', description: 'the points of the point buy (10, 15, 20, 25)'},
        scores: {type: 'string', description: 'a JSON object of the base scores you suggest or the player set, {"str": 16, "dex": 14}; the ones left out start at 10'},
        raise: {type: 'string', description: 'the abilities to raise as high as the points go, first first ("str, con")'},
        lower: {type: 'string', description: 'the abilities to dump to 7 ("int, cha")'},
      },
      required: ['budget'],
    },
    label: () => 'suggesting a point buy',
    run: (args, {character}) => offerPointBuy(args, character),
  },
  {
    name: 'price_gear',
    description: 'What a kit costs in all and the starting gold left after it. Price every kit with it before suggesting '
      + 'it; never add prices up yourself. A composite bow costs 100 gp more per point of its Strength rating, '
      + 'masterwork adds 300 gp to a weapon and 150 gp to armor.',
    parameters: {
      type: 'object',
      properties: {items: {type: 'string', description: 'a JSON array, [{"name": "Longsword", "cost_gp": 15, "quantity": 1}], cost_gp the price of one in gp: 1 gp = 10 sp = 100 cp, so 5 sp is 0.5 and 2 cp 0.02 (\"5 sp\" works too)'}},
      required: ['items'],
    },
    label: () => 'pricing the gear',
    run: (args, {character}) => priceGear(character, args),
  },
  {
    name: 'get_creation_status',
    description: 'Where creating the character stands: details, race, base scores and their point buy cost, scores '
      + 'with the race, favored class, traits, starting wealth left, and the level up status.',
    label: () => 'checking the character',
    run: (_, {character}) => creationStatus(character),
  },
  {
    name: 'create_items',
    description: 'Buys or adds several items in one call, one undo step: a kit the player agreed to. Each item takes the '
      + 'fields of create_item; what is refused is told with its problems, the rest is added.',
    parameters: {
      type: 'object',
      properties: {
        items: {type: 'string', description: 'a JSON array of the items, each as create_item takes it: [{"name": "Greataxe", "type": "weapon", "cost_gp": 20, "weight": 12, "damage": "1d12", "critical": "x3", "attack_kind": "melee", "handedness": "two-handed", "equipped": true}, {"name": "Backpack", "type": "other", "cost_gp": 2}]'},
        based_on: {type: 'string', enum: ['looked up', 'player description', 'own knowledge'], description: 'for every item that does not give its own'},
      },
      required: ['items'],
    },
    changes: true,
    label: args => `adding ${(() => { try { return JSON.parse(String(args['items'])).length; } catch { return 'the'; } })()} items`,
    run: (args, {character}) => createItems(character, args),
  },
  {
    name: 'set_character_details',
    description: 'Sets who the character is: name, alignment, deity, description, backstory, age, height, weight, favored class '
      + 'and advancement track. Give only what changes.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        alignment: {type: 'string', description: 'LG, NG, CG, LN, N, CN, LE, NE or CE'},
        deity: {type: 'string'},
        description: {type: 'string', description: 'how they look and act: appearance and personality'},
        backstory: {type: 'string', description: 'where they come from and what made them who they are'},
        age: {type: 'integer'}, height: {type: 'integer', description: 'in inches'}, weight: {type: 'integer', description: 'in pounds'},
        favored_classes: {type: 'string', description: 'the favored class (a half-elf may have two, "Fighter,Rogue")'},
        advancement_track: {type: 'string', enum: ['slow', 'medium', 'fast']},
        starting_gold: {type: 'number', description: 'the starting wealth in gp the first class level brings (rolled, or the class\'s average)'},
        starting_level: {type: 'integer', description: 'while creating: the character level it is made at, when the table starts above 1st (its gear is bought with the wealth of that level)'},
      },
    },
    changes: true,
    label: () => 'setting the details',
    run: (args, {character}) => setCharacterDetails(character, args),
  },
  {
    name: 'set_ability_scores',
    description: 'Sets the six base ability scores, before racial modifiers. A point buy is checked against its points.',
    parameters: {
      type: 'object',
      properties: {
        scores: {type: 'string', description: 'a JSON object of all six, {"str": 14, "dex": 12, "con": 14, "int": 10, "wis": 12, "cha": 8}'},
        method: {type: 'string', description: '"point buy 15" (10, 15, 20 or 25), "rolled", or "given" for scores the player already has'},
      },
      required: ['scores', 'method'],
    },
    changes: true,
    label: () => 'setting ability scores',
    // a point buy in a creation is the player's to confirm in the chat (offer_point_buy)
    run: (args, {character}) => /^\s*point/i.test(String(args['method'] ?? '')) && inCreation(character)
      ? {error: 'nothing was changed: a point buy is the player\'s to set, offer_point_buy shows it to them to change and confirm'}
      : setAbilityScores(character, args),
  },
  {
    name: 'set_race',
    description: 'Sets the race from its page (look_up_rules, kind race), replacing the old one: its racial traits as '
      + 'features, the first the racial stats (ability modifiers, speed and size with "mode": "set", languages). A '
      + 'trait giving a feat adds 1 to bonusFeats. A trait giving spell-like abilities lists them in its '
      + '"spell_like_abilities", each with its uses a day. Ask for a choice (a +2 to any one ability) first.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        subtype: {type: 'string', description: 'Humanoid (human, orc), ...'},
        features: {type: 'string', description: 'a JSON array of the racial traits, each with "shown_in" for its section of the sheet when it is not a special quality ({"name": "Orc Ferocity", "shown_in": "defensiveAbilities", "description": "...", "adjustments": {}}). An alternate racial trait the player picked has "replaces": the standard traits it replaces, as its page names them (["Hatred", "Defensive Training"]), which are left out'},
        not_on_page: {type: 'string', description: 'names of traits a refusal said its page lists that you read again and found are not on it, comma separated'},
        favored_class_options: {type: 'string', description: 'the alternate favored class bonuses its page lists for the classes the player may take, a JSON array: [{"class": "Wizard", "description": "Add +1/4 to the wizard\'s caster level when casting necromancy spells", "adjustments": {"spells.wizard.casterLevel[necromancy]": "1/4"}}] (what one pick adds)'},
        based_on: {type: 'string', enum: ['looked up', 'player description', 'own knowledge']},
        source_url: {type: 'string', description: 'the race page'},
      },
      required: ['name', 'features', 'based_on'],
    },
    changes: true,
    label: args => `setting the race ${text(args['name'])}`,
    run: (args, {character}) => setRace(character, args),
  },

  // leveling up
  {
    name: 'get_level_up_status',
    description: 'What leveling up needs: level and classes, XP and whether a level is due, ability increases owed, '
      + 'feats taken and allowed, skill ranks left and the most per skill, the core classes the app knows. Call it '
      + 'before a level up and after.',
    label: () => 'checking the level up',
    run: (_, {character}) => levelUpStatus(character),
  },
  // items that cast (rules/spell-items.ts)
  {
    name: 'use_item',
    description: 'Uses a wand, scroll, staff or potion the character has: spends its charges (a staff\'s spell may take '
      + 'more) or uses it up, and gives its caster level and save DC. With on_self a spell that changes the character\'s '
      + 'numbers goes on it. Says when Use Magic Device or a caster level check is needed: tell the player.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the item'},
        spell: {type: 'string', description: 'the spell, for an item that casts more than one (a staff)'},
        on_self: {type: 'boolean', description: 'the character is the target and the spell changes its numbers (a potion of bull\'s strength)'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `using ${text(args['name'])}`,
    run: (args, {character}) => {
      const item = (character.raw().inventory || []).find(i => i.name.toLowerCase() === text(args['name']).toLowerCase());
      if (!item) return {error: `the character has no "${text(args['name'])}"`};
      return useSpellItem(character, item.id, text(args['spell']) || undefined, {onSelf: args['on_self'] === true});
    },
  },
  {
    name: 'recharge_staff',
    description: 'Recharges a staff by a charge: the caster spends a slot of the level of its highest spell or above, once a day.',
    parameters: {
      type: 'object',
      properties: {name: {type: 'string'}, caster: {type: 'string', description: 'the caster whose slot is spent'}, level: {type: 'integer', description: 'the slot\'s level'}},
      required: ['name', 'caster', 'level'],
    },
    changes: true,
    label: args => `recharging ${text(args['name'])}`,
    run: (args, {character}) => {
      const item = (character.raw().inventory || []).find(i => i.name.toLowerCase() === text(args['name']).toLowerCase());
      if (!item) return {error: `the character has no "${text(args['name'])}"`};
      return rechargeStaff(character, item.id, text(args['caster']).toLowerCase(), Math.floor(Number(args['level'])));
    },
  },
  // retraining (Ultimate Campaign), and taking a level built wrong back off
  {
    name: 'retrain',
    description: 'Retrains one thing the character chose for another (Ultimate Campaign rules), at once: a feat, a '
      + 'class feature choice (a rage power, talent, hex, domain, school), a racial trait, an ability increase, skill '
      + 'ranks, hit points, a spontaneous caster\'s spell known, a class level, an archetype, or a new language. It is '
      + 'never refused for its days, cost or rules: it gives them back, tell the player, and the chat offers a Pay '
      + 'button for the gold. The new thing is built as for edit_feature, add_spells or add_class_level, from its page. '
      + `Whether two classes have synergy (5 days for a class level, not 7), and what a class's features may be retrained into, is on the retraining rules page: look_up_rules with url ${RETRAINING_RULES_URL}.`,
    parameters: {
      type: 'object',
      properties: {
        kind: {type: 'string', enum: [...RETRAIN_KINDS]},
        name: {type: 'string', description: 'what is retrained away: the feat, class feature, racial trait or spell as the character has it; the class for a class level'},
        quote_only: {type: 'boolean', description: 'only what it would take (days, gold, the rules), changing nothing'},
        new_name: {type: 'string', description: 'a feat, class feature or racial trait: what it becomes, with description, adjustments, grows and shown_in as edit_feature takes them'},
        description: {type: 'string'}, adjustments: {type: 'string'}, grows: {type: 'string'}, shown_in: {type: 'string'},
        prerequisites: {type: 'string', description: 'a feat: the new feat\'s prerequisites as its page lists them'},
        replaces: {type: 'string', description: 'a racial trait: the standard traits the new one replaces'},
        level: {type: 'integer', description: 'an ability increase or hit points: the character level; spells known: the spell level'},
        ability: {type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'], description: 'an ability increase: the ability it goes to'},
        moves: {type: 'string', description: 'skill ranks: a JSON array, [{"from": "climb", "to": "perception", "ranks": 1}]'},
        language: {type: 'string'},
        caster: {type: 'string', description: 'spells known: the caster (sorcerer, oracle)'},
        spells: {type: 'string', description: 'spells known: the new spell as add_spells takes it, a JSON array of one'},
        class_name: {type: 'string', description: 'a class level: the class whose highest level is retrained; an archetype: its class'},
        new_class: {type: 'string', description: 'a class level: the class it becomes, with that level as add_class_level takes it (features, rolled_hp, hit_die, ...)'},
        features: {type: 'string', description: 'a class level: its class features as add_class_level takes them; an archetype: the features it puts on, each with "gained_at" (the class level); else for the days: how many class features the retraining changes'},
        rolled_hp: {type: 'integer'}, hit_die: {type: 'integer'}, bab: {type: 'string'}, good_saves: {type: 'string'}, skill_ranks: {type: 'integer'}, class_skills: {type: 'string'}, table_row: {type: 'string'},
        archetypes: {type: 'string', description: 'an archetype taken: as add_class_level takes them'},
        give_up: {type: 'string', description: 'an archetype given up: its name'},
        remove_features: {type: 'string', description: 'an archetype: the class features it takes off the class\'s levels, comma separated'},
        synergy: {type: 'boolean', description: 'a class level: the two classes have synergy (the rules page lists them): 5 days instead of 7'},
        npc_class: {type: 'boolean', description: 'a class level of an NPC class (adept, aristocrat, commoner, expert): 3 days'},
        no_trainer: {type: 'boolean', description: 'no trainer to be had: twice the days'},
        based_on: {type: 'string', enum: ['looked up', 'player description', 'own knowledge']},
        source_url: {type: 'string'},
      },
      required: ['kind'],
    },
    changes: true,
    label: args => `retraining ${text(args['name']) || text(args['kind']) || 'something'}`,
    run: (args, {character}) => retrain(character, args),
  },
  {
    name: 'remove_class_level',
    description: 'Takes the last class level off (one built wrong, or before a rebuild): its hit points, features and '
      + 'spells go with it. Says what the character then has more of than its levels allow.',
    changes: true,
    label: () => 'removing the last class level',
    run: (_, {character}) => removeLastClassLevel(character),
  },
  // a companion's link to its master (rules/companions.ts)
  {
    name: 'set_companion',
    description: 'For a companion (a familiar, an animal companion, a mount): which of its master\'s classes grant it '
      + '(their levels stack: its master class level), what the class feature adds to that for its own level (a '
      + 'ranger\'s animal companion: -3), and the abilities its ability score increases raised (an animal companion\'s '
      + 'at 4th, 9th, 14th and 19th). Give only what changes.',
    parameters: {
      type: 'object',
      properties: {
        classes: {type: 'string', description: 'the master\'s classes, comma separated: "Wizard, Witch"'},
        level_offset: {type: 'integer', description: 'added to the master class level, as the class feature says (0 for a druid, -3 for a ranger)'},
        increases: {type: 'string', description: 'the abilities its increases raised, in order: "str, dex"'},
        without: {type: 'string', description: 'the abilities of its kind its class feature takes away, comma separated (a cavalier\'s mount: "Share Spells")'},
        good_saves: {type: 'string', description: 'an eidolon: the good saves of its base form, "fort, will" (biped), "fort, ref" (quadruped), "ref, will" (serpentine)'},
        unchained: {type: 'boolean', description: 'an eidolon: true for the Unchained summoner\'s'},
        synthesist: {type: 'boolean', description: 'an eidolon: true for a synthesist\'s, which its summoner fuses with (its summoner gets a Fused form of it)'},
      },
    },
    changes: true,
    label: () => 'linking the companion to its master',
    run: (args, {character}) => setCompanion(character, {
      ...(text(args['classes']) ? {classes: text(args['classes']).split(',')} : {}),
      ...(args['level_offset'] !== undefined && args['level_offset'] !== '' ? {levelOffset: Number(args['level_offset'])} : {}),
      ...(text(args['increases']) ? {increases: text(args['increases']).split(',')} : {}),
      ...(text(args['without']) ? {without: text(args['without']).split(',')} : {}),
      ...(text(args['good_saves']) ? {goodSaves: text(args['good_saves']).split(',')} : {}),
      ...(typeof args['unchained'] === 'boolean' ? {unchained: args['unchained']} : {}),
      ...(typeof args['synthesist'] === 'boolean' ? {synthesist: args['synthesist']} : {}),
    }),
  },
  // leveling up step by step (level-up-script.ts), as the creation goes
  {
    name: 'get_level_up_step',
    description: 'Starts leveling the character up by one level (or gives the step a level up is at): its questions, '
      + 'how to help, its tools. Call it once when the player wants to level up: complete_level_up_step gives each '
      + 'next step. Its changes are refused until the player answered.',
    label: () => 'starting the level up',
    run: (_, {character, conversation}) => getLevelUpStep(character, conversation ?? {playerTurns: 0}),
  },
  {
    name: 'complete_level_up_step',
    description: 'Completes the level up\'s step once the player answered and its changes are made, with what they '
      + 'decided. Gives the next step to ask about; the last one ends the level up once the app\'s check passes.',
    parameters: {
      type: 'object',
      properties: {
        step: {type: 'string', description: 'the id of the step being completed'},
        decisions: {type: 'string', description: 'what the player decided at this step, in a sentence or two'},
      },
      required: ['step', 'decisions'],
    },
    changes: true,
    label: () => 'completing the step',
    run: (args, {character, conversation}) => completeCreationStep(character, conversation ?? {playerTurns: 0}, args),
  },
  {
    name: 'add_class_level',
    description: 'Adds one level in a class: the next of a class the character has, a core class (its preset), or '
      + 'another class by hit_die, bab, good_saves, skill_ranks and class_skills from its page. The engine works out '
      + 'bab, saves and hp. features are this level\'s class features from the class page, as for create_feature, '
      + 'each shown through the specialAttack, defensiveAbilities or specialQuality entry it gives (a switched one has '
      + '"active": false on that entry); a number that grows goes in "grows" by level, uses a day in "uses_by_level"; '
      + 'others are refused with how to fix them. Every level after the first needs the hit die the player rolled. '
      + 'An archetype is given with the level it is taken at (archetypes): its features replace those it trades.',
    parameters: {
      type: 'object',
      properties: {
        class_name: {type: 'string', description: 'Barbarian, Fighter, ...'},
        rolled_hp: {type: 'integer', description: 'what the player rolled on the hit die, for every level but the first'},
        favored_class_bonus: {type: 'string', enum: ['hp', 'skill', 'other'], description: 'for a level in a favored class: +1 hp, +1 skill rank, or other: an alternate bonus the race\'s page lists for the class (favored_class_option)'},
        favored_class_option: {type: 'string', description: 'with favored_class_bonus other: the race\'s alternate bonus the player picked, by its name or description when the race has it already (get_level_up_status lists them), else from the race page as a JSON object: {"description": "Add +1/4 to the wizard\'s caster level when casting necromancy spells", "adjustments": {"spells.wizard.casterLevel[necromancy]": "1/4"}} (what one pick adds; the app adds up the picks and rounds down)'},
        favored_class_choices: {type: 'string', description: 'with favored_class_option: the player\'s picks for an alternate bonus that leaves some to each pick (it lists "choices"), a JSON object by their ids: {"energy": "cold"}. Picks of one option add up only with levels of the same picks'},
        ability_increase: {type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'], description: 'on every 4th character level'},
        features: {type: 'string', description: 'a JSON array of the class features this level gives, each with "gained_at" (the level of its table row), its adjustments, and "grows" for a number that grows with level (its value by level, as the class table lists it: the app writes the formula), [{"name": "Track", "gained_at": 1, "description": "+1/2 level (min 1) to follow tracks", "adjustments": {}, "grows": {"skills.survival.value[follow tracks]": {"1": 1, "4": 2, "6": 3, "8": 4, "10": 5, "12": 6, "14": 7, "16": 8, "18": 9, "20": 10}}}], with "shown_in" for its section of the sheet (specialAttack, defensiveAbilities; specialQuality when left out), "[]" for none (a 1st class level always has some)'},
        based_on: {type: 'string', enum: ['looked up', 'player description', 'own knowledge'], description: 'as for create_feature'},
        source_url: {type: 'string', description: 'the class page'},
        hit_die: {type: 'integer', description: 'not a core class only, as are the four below'},
        bab: {type: 'string', enum: ['full', 'threeQuarters', 'half']},
        good_saves: {type: 'string', description: '"fort,will"'},
        skill_ranks: {type: 'integer', description: 'per level'},
        class_skills: {type: 'string', description: '"climb,intimidate,knowledge (dungeoneering)"'},
        starting_gold: {type: 'number', description: 'not a core class, the character\'s first level: the class\'s average starting wealth in gp (5d6 x 10 is 175)'},
        weapon_proficiencies: {type: 'string', description: 'not a core class, its first level: the weapons of its "Weapon and Armor Proficiency" ("simple, martial"; "simple, hand crossbow, rapier"; "none")'},
        armor_proficiencies: {type: 'string', description: 'not a core class, its first level: the armor and shields ("light, medium, shield"; "none")'},
        alignment: {type: 'string', description: 'not a core class, its first level: the alignments its page allows ("any", "any lawful", "any nonlawful", "lawful good", "any neutral")'},
        table_row: {type: 'string', description: 'the class table\'s row for this level as it lists it, a JSON object {"bab": 1, "fort": 2, "ref": 2, "will": 0} (needed for a class without a preset): its bab and saves are checked against it'},
        spellcasting: {type: 'string', description: 'a class that casts and has no preset (not a core class), its first level: how it casts, from its page, a JSON object: {"ability": "cha", "type": "spontaneous", "magic": "divine", "table": "sorcerer"} when its spells per day and known are a core class\'s (bard, cleric, druid, paladin, ranger, sorcerer, wizard; an oracle\'s are the sorcerer\'s, a witch\'s the wizard\'s), else its own table\'s rows by class level, every level: "spells_per_day": {"1": ["-", 1], "2": ["-", 2], ...} (each row its spell levels from 0, "-" for none) and "spells_known" the same for a class that counts what it knows. Also "caster_level_offset" (-3 for a paladin\'s), "extra_slot" ("domain" or "school")'},
        school: {type: 'string', description: 'a class that specializes in a school (a wizard), its first level: the school the player picked, or "universalist"'},
        opposition_schools: {type: 'string', description: 'with school: the two schools the player gave up, "enchantment, necromancy"'},
        domains: {type: 'string', description: 'a class that picks domains (a cleric), its first level: the domains the player picked, "Fire, Sun"'},
        prestige: {type: 'boolean', description: 'a prestige class, its first level: true (its good saves start at +1, its table as a prestige class\'s)'},
        requirements: {type: 'string', description: 'a prestige class, its first level: its requirements as its page lists them ("Alignment: any evil. Skills: Stealth 5 ranks. Feats: Dodge. Spells: able to cast 2nd-level arcane spells"): checked against the sheet'},
        advances_casting: {type: 'string', description: 'a level that gives "+1 level of existing spellcasting class" (a prestige class\'s, as its table says for that level): the class (or classes, comma separated, for one that advances two) whose spells per day, spells known and caster level go up'},
        archetypes: {type: 'string', description: `the archetypes the player takes at this level (usually the class's 1st), each looked up (kind archetype, the class first: "Barbarian Invulnerable Rager"), a JSON array: ${ARCHETYPE_FORM}. "replaces" and "alters" are the class features of the class it replaces or changes, as the page says; its class skills and proficiencies as it changes them. The level's features are then the archetype's of this level with the class's it keeps. A later level of the class leaves out what an archetype of it replaced`},
      },
      required: ['class_name', 'features'],
    },
    changes: true,
    label: args => `adding a level of ${text(args['class_name']) || 'a class'}`,
    run: (args, {character}) => addClassLevel(character, args),
  },
  {
    name: 'set_favored_class_bonus',
    description: 'Changes the favored class bonus of a level the character has (add_class_level always adds a new '
      + 'level): +1 hp, +1 skill rank, or other, an alternate bonus of the race for the class.',
    parameters: {
      type: 'object',
      properties: {
        level: {type: 'integer', description: 'the character level, the last one when left out'},
        favored_class_bonus: {type: 'string', enum: ['hp', 'skill', 'other']},
        favored_class_option: {type: 'string', description: 'with other: as for add_class_level'},
        favored_class_choices: {type: 'string', description: 'as for add_class_level'},
      },
      required: ['favored_class_bonus'],
    },
    changes: true,
    label: () => 'setting the favored class bonus',
    run: (args, {character}) => setFavoredClassBonus(character, args),
  },
  {
    name: 'set_skill_ranks',
    description: 'Sets the ranks of one or more skills (the total ranks each should have, not how many to add). '
      + 'Checked against the ranks the character has and the most per skill (one per character level).',
    parameters: {
      type: 'object',
      properties: {ranks: {type: 'string', description: 'a JSON object of skills and their ranks, {"climb": 2, "knowledge (dungeoneering)": 1}'}},
      required: ['ranks'],
    },
    changes: true,
    label: () => 'setting skill ranks',
    run: (args, {character}) => setSkillRanks(character, args),
  },
  {
    name: 'choose_ability_increase',
    description: 'Picks the ability an owed ability increase (every 4th character level) raises.',
    parameters: {
      type: 'object',
      properties: {
        ability: {type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha']},
        level: {type: 'integer', description: 'the character level it is for, the first owed one when left out'},
      },
      required: ['ability'],
    },
    changes: true,
    label: args => `raising ${text(args['ability'])}`,
    run: (args, {character}) => chooseAbilityIncrease(character, args),
  },

  // changing what the character has
  {
    name: 'edit_feature',
    description: 'Changes a feature the character has: a feat, trait, condition, class or racial feature, or a feature '
      + 'of an item (name the item). Give only what changes. New adjustments replace the old ones whole: read the '
      + 'feature first (get_feature) and write all of them. Checked like create_feature before it changes.',
    parameters: {
      type: 'object',
      properties: {
        grows: {type: 'string', description: 'a number that grows by level, as the rules table lists it: {"<adjustment path>": {"<level>": <value>, ...}}; the app writes the formula (never write one yourself)'},
        name: {type: 'string', description: 'the feature as it is named now'},
        form: {type: 'string', description: 'a condition that is a form the character changes into: as create_feature takes it; "none" for no longer one'},
        item: {type: 'string', description: 'the item it is on, for the feature of an item'},
        new_name: {type: 'string'},
        description: {type: 'string'},
        adjustments: {type: 'string', description: 'a JSON object of every adjustment it should have'},
        uses_total: {type: 'integer', description: 'uses per day or encounter, 0 for none'},
        uses_label: {type: 'string'},
        uses_per: {type: 'string', enum: ['day', 'encounter', 'none']},
        can_turn_off: {type: 'boolean'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `changing ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => editFeature(character, args),
  },
  {
    name: 'remove_feature',
    description: 'Removes a feature the character has (a feat, a trait, a condition, a feature of an item). A feature '
      + 'another feature gives is changed or removed through that one.',
    parameters: {
      type: 'object',
      properties: {name: {type: 'string'}, item: {type: 'string', description: 'the item it is on, for the feature of an item'}},
      required: ['name'],
    },
    changes: true,
    label: args => `removing ${text(args['name']) || 'a feature'}`,
    run: (args, {character}) => removeFeature(character, args),
  },
  {
    name: 'edit_item',
    description: 'Changes an item in the inventory: its name, description, quantity, weight, cost, slot, whether it is '
      + 'equipped, or its features (a JSON array replacing them all: read the item first and write every one).',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'the item as it is named now'},
        new_name: {type: 'string'},
        description: {type: 'string'},
        quantity: {type: 'integer'},
        weight: {type: 'number'},
        cost_gp: {type: 'string', description: 'the new price of one in gp: 1 gp = 10 sp = 100 cp, so 5 sp is 0.5 and 2 cp 0.02 (\"5 sp\" works too)'},
        slot: {type: 'string', enum: slots},
        equipped: {type: 'boolean'},
        features: {type: 'string', description: 'a JSON array of every feature it should have'},
      },
      required: ['name'],
    },
    changes: true,
    label: args => `changing ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => editItem(character, args),
  },
  {
    name: 'remove_item',
    description: 'Removes an item from the inventory (sold, lost, used up).',
    parameters: named('the item'),
    changes: true,
    label: args => `removing ${text(args['name']) || 'an item'}`,
    run: (args, {character}) => removeItem(character, args),
  },
  {
    name: 'undo_last_change',
    description: 'Takes back the last change to the character (one of your actions, or what the player changed on '
      + 'the sheet), when the player asks you to undo something.',
    changes: true,
    label: () => 'undoing',
    run: (_, {character}) => undoLast(character),
  },
];

// while creating, a change is refused until the player answered its step: an answer they gave before it was asked
// counts when the AI quotes it (creationGate). every tool a step makes its changes with takes it
const GATED_TOOLS = new Set([...CREATION_STEPS.flatMap(step => step.tools), 'complete_creation_step']);
const PLAYER_ANSWER = {
  type: 'string' as const,
  description: 'while creating: the player\'s own words answering this, when they gave them before the step was asked',
};
for (const tool of aiTools) {
  if (GATED_TOOLS.has(tool.name) && tool.parameters) {
    tool.parameters = {...tool.parameters, properties: {...tool.parameters.properties, player_answer: PLAYER_ANSWER}};
  }
}

export const aiToolByName = (name: string): AiTool | undefined => aiTools.find(tool => tool.name === name);

// what the conversation is about: creating the character (no class level yet, or the creation script under way) or
// playing it (questions, play actions, leveling up). every request sends the declarations of the tools it offers, so
// each mode offers only its own: the play actions are of no use while creating, the creation tools none once created.
// reading, looking up, building, editing and undo are offered in both
export type AiMode = 'creation' | 'play';

const inCreation = (character: ApplyCharacterService): boolean => aiModeOf(character.raw()) === 'creation';

export const aiModeOf = (raw: {classLevels?: unknown[], creation?: unknown}): AiMode =>
  raw.creation || !(raw.classLevels || []).length ? 'creation' : 'play';

export const PLAY_ONLY_TOOLS = [
  'take_damage', 'heal', 'add_condition', 'remove_condition', 'set_feature_active', 'use_feature', 'set_combat_option',
  'cast_spell', 'rest', 'use_item', 'recharge_staff', 'craft_item', 'get_level_up_step', 'complete_level_up_step', 'retrain', 'remove_class_level',
];
export const CREATION_ONLY_TOOLS = [
  'get_creation_step', 'complete_creation_step', 'offer_point_buy', 'price_gear', 'get_creation_status', 'set_ability_scores', 'set_race',
];

export const aiToolsFor = (mode: AiMode): AiTool[] => {
  const left = mode === 'creation' ? PLAY_ONLY_TOOLS : CREATION_ONLY_TOOLS;
  const tools = aiTools.filter(tool => !left.includes(tool.name));
  if (mode === 'creation') return tools;
  // player_answer is only for the creation's steps
  return tools.map(tool => {
    if (!tool.parameters?.properties?.['player_answer']) return tool;
    const {player_answer, ...properties} = tool.parameters.properties;
    return {...tool, parameters: {...tool.parameters, properties}};
  });
};

// runs a tool the AI asked for. a tool that fails or does not exist gives the AI an error to work with, never throws
export const runAiTool = async (name: string, args: {[name: string]: unknown}, context: AiToolContext): Promise<object> => {
  const tool = aiToolByName(name);
  if (!tool) return {error: `there is no tool ${name}, the tools are ${aiTools.map(t => t.name).join(', ')}`};
  try {
    const result = await tool.run(args || {}, context);
    // a function result is an object for every provider
    return Array.isArray(result) ? {results: result} : result;
  } catch (e) {
    return {error: `${name} failed: ${(e as Error).message}`};
  }
};
