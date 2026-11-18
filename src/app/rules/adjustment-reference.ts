import {Character} from '../utils/character.class';
import {MeleeAttack} from '../utils/attack.class';
import {KNOWLEDGE_SPECIALTIES, OPEN_SKILL_FAMILIES} from '../utils/skilllist.class';
import {formulaFunctions} from '../utils/object.util';
import {
  adjustmentObjectFields, bonusTypes, characterFields, featureFields, featureListPaths, FieldDoc, groupFieldDocs,
  openGroups, specialValues,
} from './adjustment-schema';

// the reference of everything a feature can adjust, written from the schema (adjustment-schema.ts) and the character
// itself, so it can not drift from what the engine does: for whoever writes features without reading the code (an AI
// writing the features of a class level, a player writing JSON). pf1.reference() prints it in the browser console
// the examples are checked by a spec: each of them validates without a problem

export const modeDocs: {[mode: string]: string} = {
  add: 'adds to the value, the default. bonuses of the same type do not stack: only the highest applies',
  set: 'replaces the base value, adds still add on top of it. the last set wins (a race setting size or speed)',
  min: 'caps the value: it can not end up higher than this, the lowest cap wins (armor capping maxDexBonus)',
  max: 'floors the value: it can not end up lower than this, the highest floor wins. a floor above a cap wins',
};

export interface ReferenceExample {
  description: string;
  feature: {name: string, description: string, adjustments: {[path: string]: any}, charges?: object};
}

export const referenceExamples: ReferenceExample[] = [
  {
    description: 'a feat with a typed bonus',
    feature: {name: 'Iron Will', description: '+2 on Will saves', adjustments: {'saves.will': 2}},
  },
  {
    description: 'a bonus that scales with the level, rounded down',
    feature: {
      name: 'Toughness', description: '+3 hp, +1 per hit die beyond 3',
      adjustments: {hp: 'max(3, {level})'},
    },
  },
  {
    description: 'a class feature that scales with the levels of its class, only against fear (a variant)',
    feature: {
      name: 'Bravery', description: '+1 on Will saves against fear at 2nd fighter level, +1 more every 4 levels after',
      adjustments: {'saves.will[vs. fear]': 'floor(({level.fighter}+2)/4)'},
    },
  },
  {
    description: 'a class feature shown as a special attack, its dice in the text',
    feature: {
      name: 'Sneak Attack', description: '+1d6 precision damage per 2 rogue levels (rounded up)',
      adjustments: {specialAttack: {name: 'Sneak Attack', description: '+1d6 per 2 rogue levels, flanking or flat-footed'}},
    },
  },
  {
    description: 'a feature used a number of times a day, with morale bonuses while active',
    feature: {
      name: 'Rage', description: '+4 Str and Con, +2 Will, -2 AC, 4 + Con modifier rounds per day, +2 per level',
      charges: {total: 6, current: 6, per: 'day', label: 'rounds'},
      adjustments: {
        'abilityScores.str': {value: 4, type: 'morale'},
        'abilityScores.con': {value: 4, type: 'morale'},
        'saves.will': {value: 2, type: 'morale'},
        ac: -2,
      },
    },
  },
  {
    description: 'a class feature shown as a special attack the player switches on while it applies (the toggle and the bonuses on the entry it gives, a class feature itself does not show)',
    feature: {
      name: 'Studied Target', description: 'move action: +1 attack, damage and some skills against one creature, +1 per 5 slayer levels',
      adjustments: {specialAttack: {
        name: 'Studied Target', description: 'on while attacking the studied target', active: false,
        adjustments: {
          'melee.*.toHitBonus': '1+floor({level.slayer}/5)', 'melee.*.damageBonus': '1+floor({level.slayer}/5)',
          'skills.perception.value': '1+floor({level.slayer}/5)', 'skills.sense motive.value': '1+floor({level.slayer}/5)',
        },
      }},
    },
  },
  {
    description: 'a race: sets size and speed, adds racial bonuses',
    feature: {
      name: 'Halfling', description: 'small, slow, +2 Dex and Cha, -2 Str, +2 Acrobatics, Climb and Perception, +1 on all saves',
      adjustments: {
        size: {value: 3, mode: 'set'},
        'speed.land': {value: 20, mode: 'set'},
        'abilityScores.dex': 2, 'abilityScores.cha': 2, 'abilityScores.str': -2,
        'skills.acrobatics.value': {value: 2, type: 'racial'},
        'skills.climb.value': {value: 2, type: 'racial'},
        'skills.perception.value': {value: 2, type: 'racial'},
        savingThrowBonus: {value: 1, type: 'racial'},
        languages: ['halfling'],
      },
    },
  },
  {
    description: 'armor: a capped Dex bonus, a check penalty and arcane spell failure',
    feature: {
      name: 'Chainmail', description: 'medium armor',
      adjustments: {
        ac: {value: 6, type: 'armor'},
        maxDexBonus: {value: 2, mode: 'min'},
        armorCheckPenalty: -5,
        arcaneSpellFailureChance: 30,
      },
    },
  },
  {
    description: 'a penalty to every Str and Dex skill, and a situational one',
    feature: {
      name: 'Entangled', description: '-2 attack, -4 Dex, half speed',
      adjustments: {
        attackRollBonus: -2,
        'abilityScores.dex': -4,
        'speed.land': 'half',
        'skills.perception.value[opposed]': -4,
      },
    },
  },
  {
    description: 'a bonus that only applies while another feature is active',
    feature: {
      name: 'Raging Vitality', description: 'the morale bonus of rage to Con is 2 higher (untyped: a second morale bonus would not stack)',
      adjustments: {'abilityScores.con': {value: 2, if: 'Rage'}},
    },
  },
  {
    description: 'a bonus to every melee attack',
    feature: {
      name: 'Weapon Training', description: '+1 attack and damage with every melee weapon',
      adjustments: {'melee.*.toHitBonus': 1, 'melee.*.damageBonus': 1},
    },
  },
  {
    description: 'a feat that makes a combat option available (the rules work out what it does)',
    feature: {name: 'Power Attack', description: '-1 attack, +2 damage per 4 bab', adjustments: {'availableCombatOptions.powerAttack': true}},
  },
  {
    description: 'a caster that is not one of the core classes (those get theirs from their class levels): its caster level and spells per day by spell level',
    feature: {
      name: 'Cleric Spells', description: 'casts like a 1st level cleric',
      adjustments: {
        'spells.Cleric.casterLevel': 1,
        'spells.Cleric.spells.0.perDay.total': 3,
        'spells.Cleric.spells.1.perDay.total': 1,
      },
    },
  },
  {
    description: 'defenses: damage reduction by what overcomes it, energy resistance, immunities',
    feature: {
      name: 'Stoneskin', description: 'DR 10/adamantine',
      adjustments: {'damageReduction.adamantine': 10, 'energyResistance.fire': 10, immunities: ['petrification']},
    },
  },
];

const table = (header: string[], rows: string[][]): string =>
  [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

const code = (text: string): string => '`' + text + '`';

const fieldRow = (path: string, doc: FieldDoc): string[] =>
  [code(path), doc.kind, doc.description + (doc.example ? `. e.g. ${code(doc.example)}` : '')];

// the fields of a group of fixed fields (abilityScores, saves, ...), read from a new character
const groupFields = (group: string): string[] => {
  const value = (new Character() as any)[group];
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
};

export const adjustmentReference = (): string => {
  const adjustable = Object.entries(characterFields).filter(([path, doc]) =>
    !path.includes('.') && doc.kind !== 'state' && doc.kind !== 'derived');
  const rows: string[][] = [];
  for (const [path, doc] of adjustable) {
    rows.push(fieldRow(path, doc));
    if (doc.kind !== 'group' || path === 'skills' || openGroups[path]) continue;
    for (const field of groupFields(path)) {
      const fieldDoc = characterFields[`${path}.${field}`] || groupFieldDocs[`${path}.${field}`];
      const sample = (new Character() as any)[path][field];
      rows.push(fieldRow(`${path}.${field}`, fieldDoc || {
        kind: typeof sample === 'boolean' ? 'boolean' : Array.isArray(sample) ? 'list' : 'number', description: '',
      }));
    }
  }
  const skills = Object.keys(new Character().skills);
  const attackFields = Object.keys(new MeleeAttack());

  return [
    '# Adjusting a character',
    '',
    'A character is worked out from its features: every class level, race, feat, trait, condition and equipped item',
    'has features, and each feature adjusts the character. The sheet shows where every number comes from by the name',
    'of the feature, so give each one a name.',
    '',
    `A feature is \`{"name": ..., "description": ..., "adjustments": {...}}\`, its fields are ${featureFields.map(code).join(', ')}.`,
    '`active: false` turns it off, `charges` are `{"total": 3, "current": 3, "per": "day" | "encounter" | "none", "label": "uses"}`.',
    `Features are kept in ${featureListPaths.map(code).join(', ')}.`,
    '',
    '## Adjustments',
    '',
    'Adjustments are `"path": value`. The path is that of a field of the character (below), the value is added to it:',
    '`"saves.will": 2`. An adjustment can also be an object:',
    '',
    table(['field', 'what it is'], Object.entries(adjustmentObjectFields).map(([f, d]) => [code(f), d])),
    '',
    '### Modes',
    '',
    table(['mode', 'what it does'], Object.entries(modeDocs).map(([m, d]) => [code(m), d])),
    '',
    'Sets, caps and floors are worked out after every add. Modes only work on numbers.',
    '',
    '### Bonus types',
    '',
    'Bonuses of the same type do not stack, only the highest applies. Untyped bonuses (no type) and dodge bonuses',
    'stack with everything, circumstance bonuses stack unless they come from the same feature. A penalty is usually',
    'untyped. Write the type exactly as below, a misspelled type stacks with everything.',
    '',
    table(['type', 'for'], Object.entries(bonusTypes).map(([t, d]) => [code(t), d])),
    '',
    '### Formulas',
    '',
    'A value can be a formula, worked out against the character: `"hp": "max(3, {level})"`.',
    '',
    '- numbers and `+ - * /` with the usual precedence (`*` and `/` first), parentheses, a leading minus',
    '- `{path}` is the number at that path of the character: `{bab}`, `{abilityScores.str}`',
    '- `{mod:abilityScores.str}` is the modifier of an ability score, ability damage included',
    '- `{level}` is the character level, `{level.rogue}` its levels in a class',
    `- functions: ${Object.keys(formulaFunctions).map(f => code(f + '(...)')).join(', ')}`,
    '- division is not rounded. Pathfinder rounds down: "+1 per 4 levels" is `floor({level}/4)`, "1d6 per 2 levels',
    '  (1st, 3rd, 5th, ...)" is `ceil({level}/2)`',
    '',
    '### Special values',
    '',
    table(['value', 'what it does'], Object.entries(specialValues).map(([v, d]) => [code(v), d])),
    '',
    '### Variants, conditions and selectors',
    '',
    '- `path[variant]` is a bonus that only applies sometimes, the sheet shows it next to the value without adding it:',
    '  `"skills.perception.value[opposed]": -4`, `"saves.will[vs. fear]": 2`. A variant always adds, modes are ignored.',
    '  A bonus to one combat maneuver, one kind of save or check, or only in some situations is always a variant, never',
    '  the plain path (which would add it all the time): Improved Grapple is `{"cmb[grapple]": 2, "cmd[grapple]": 2}`,',
    '  a bonus on saves against fear `"saves.fort[vs. fear]"`, `"saves.ref[vs. fear]"` and `"saves.will[vs. fear]"`,',
    '  a bonus when charging `"attackRollBonus[charging]"`, a bonus with one kind of weapon (Weapon Focus) named after',
    '  it, `"attackRollBonus[dwarven waraxe]": 1`. Name the variant as the rules name the situation',
    '- `"if": "Rage"` applies an adjustment only while a feature named Rage is active, `"unless"` only while it is not',
    '- `skills.*.value` adjusts every skill, `skills.@dex.value` every skill based on Dex',
    '- `melee.*.toHitBonus` adjusts a field of every melee attack, `ranged.*` every ranged attack',
    '',
    '## What can be adjusted',
    '',
    table(['path', 'kind', 'what it is'], rows),
    '',
    'Kinds: `number` takes a number, a formula or a special value; `boolean` true or false; `text` a string added after',
    'what is there; `list` a string or a list of strings; `features` a feature or a list of them; `attacks` an attack or',
    'a list of them; `casters` spell casters by origin; `group` is not adjusted itself, its fields are.',
    '',
    '### Skills',
    '',
    `Skills go by their name in lower case: ${skills.map(code).join(', ')}.`,
    'Each one has `value` (a bonus, on top of ranks, ability and the class skill bonus), `ranks` and `classSkill`',
    '(`"skills.perception.classSkill": true`). Knowledge, craft, perform and profession are families, their skills are',
    `in subSkills: ${code('skills.knowledge.subSkills.arcana.value')}. The knowledges are ${KNOWLEDGE_SPECIALTIES.map(code).join(', ')};`,
    `${OPEN_SKILL_FAMILIES.join(', ')} take any skill (${code('skills.craft.subSkills.alchemy.ranks')}).`,
    '',
    '### Open groups',
    '',
    table(['group', 'keys'], Object.entries(openGroups).map(([group, {keys}]) =>
      [code(`${group}.<key>`), Array.isArray(keys) ? keys.map(code).join(', ') : String(keys)])),
    '',
    '### Attacks',
    '',
    `An attack (in \`melee\` or \`ranged\`) has the fields ${attackFields.map(code).join(', ')}.`,
    '`toHitAbility` and `damageAbility` are abilities (`str`, `dex`), `damage` the dice (`1d8`), `crit` the lowest',
    'roll that threatens and `critMultiplier` the multiplier, `type` is `iterative` (weapons) or `natural`.',
    'A natural attack makes `count` rolls. `usesHands: true` marks one made with a hand, one per roll (claws, slams):',
    'each hand holding an item (a two-handed weapon both, a shield or torch one) takes one roll away. A bite, tail,',
    'tentacle or gore leaves it off and is made whatever the hands hold.',
    '',
    '## What can not be adjusted',
    '',
    table(['path', 'why'], Object.entries(characterFields)
      .filter(([, doc]) => doc.kind === 'derived' || doc.kind === 'state')
      .map(([path, doc]) => [code(path), `${doc.kind === 'derived' ? 'worked out by the engine' : 'kept by the player'}: ${doc.description}`])),
    '',
    '## Examples',
    '',
    ...referenceExamples.flatMap(({description, feature}) => [
      `${description[0].toUpperCase()}${description.slice(1)}:`, '', '```json', JSON.stringify(feature, null, 2), '```', '',
    ]),
  ].join('\n');
};
