import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {ConditionsService} from '../conditions.service';
import {Feature} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {ClassLevel} from '../utils/classlevel.class';
import exampleCharacter from '../example-character.json';
import exampleCleric from '../example-cleric.json';
import {
  AdjustmentProblem, bonusTypes, characterFields, closest, formatProblems, hasErrors, openGroups, resolvePath,
  validateAdjustments, validateCharacter, validateFeature,
} from './adjustment-schema';
import {adjustmentReference, referenceExamples} from './adjustment-reference';

const messages = (problems: AdjustmentProblem[]): string[] => problems.map(p => `${p.severity}: ${p.path}: ${p.message}`);
const only = (adjustments: any): AdjustmentProblem[] => validateAdjustments(adjustments);

describe('adjustment schema', () => {
  describe('documents the character', () => {
    // fields of the character that are declared without being given a value, so a new character does not have them
    const declaredOnly = ['damageTaken'];

    it('documents every field of the character', () => {
      const fields = [...Object.keys(new Character()), ...declaredOnly];
      const undocumented = fields.filter(field => !characterFields[field]);
      expect(undocumented).withContext('add these to characterFields in adjustment-schema.ts').toEqual([]);
    });

    it('documents no field the character does not have', () => {
      const fields = new Set([...Object.keys(new Character()), ...declaredOnly]);
      const extra = Object.keys(characterFields).filter(path => !fields.has(path.split('.')[0]));
      expect(extra).toEqual([]);
      for (const path of Object.keys(characterFields).filter(p => p.includes('.'))) {
        expect('error' in resolvePath(path)).withContext(path).toBeFalse();
      }
    });

    it('knows the keys of the open groups the character has', () => {
      for (const group of Object.keys(openGroups)) expect(characterFields[group]).withContext(group).toBeDefined();
    });
  });

  describe('validates adjustments', () => {
    it('finds nothing wrong with adjustments the engine can use', () => {
      expect(messages(only({
        'abilityScores.str': {value: 4, type: 'enhancement'},
        'skills.sense motive.value': 2,
        'skills.knowledge.subSkills.arcana.ranks': 1,
        'skills.craft.subSkills.alchemy.value': 2,
        'skills.*.value[reaction]': -4,
        'skills.@dex.value': -2,
        'skills.perception.classSkill': true,
        'saves.will[vs. fear]': 'floor(({level.fighter}+2)/4)',
        'speed.land': 'half',
        'damageReduction.cold iron or silver': 5,
        'damageReduction.-': 1,
        'energyResistance.fire': 10,
        'melee.*.toHitBonus': '{mod:abilityScores.dex}',
        'availableCombatOptions.powerAttack': true,
        'denyDexBonus.ac': true,
        maxDexBonus: {value: 3, mode: 'min'},
        size: {value: 3, mode: 'set'},
        languages: ['orc', 'goblin'],
        immunities: 'fear',
        senses: 'darkvision 60 ft.',
        'spells.Cleric.casterLevel': 1,
        'spells.Cleric.spells.1.perDay.total': 1,
        hp: {value: 'max(3, {level})', if: 'Toughness', unless: ['Dying']},
      }))).toEqual([]);
    });

    it('finds paths that lead nowhere and suggests what was meant', () => {
      const found = messages(only({
        'abilityScore.str': 2,
        'abilityScores.strength': 2,
        'skills.Acrobatics.value': 1,
        'skills.perceptoin.value': 1,
        'skills.knowledge.subSkills.arcane.value': 2,
        'skills.@dexterity.value': 1,
        'energyResistance.ice': 5,
        'availableCombatOptions.powerattack': true,
        'melee.*.toHit': 1,
        'saves.wil': 1,
      }));
      expect(found).toEqual([
        'error: adjustments.abilityScore.str: the character has no field "abilityScore", did you mean "abilityScores"?',
        'error: adjustments.abilityScores.strength: abilityScores has no field "strength", did you mean "str"?',
        'error: adjustments.skills.Acrobatics.value: there is no skill "Acrobatics" (skills go by their name in lower case), did you mean "acrobatics"?',
        'error: adjustments.skills.perceptoin.value: there is no skill "perceptoin" (skills go by their name in lower case), did you mean "perception"?',
        'error: adjustments.skills.knowledge.subSkills.arcane.value: there is no knowledge "arcane", did you mean "arcana"?',
        'error: adjustments.skills.@dexterity.value: skills.@<ability> takes an ability, "dexterity" is not one, did you mean "dex"?',
        'error: adjustments.energyResistance.ice: energyResistance has no "ice", it is one of: acid, cold, electricity, fire, sonic',
        'error: adjustments.availableCombatOptions.powerattack: availableCombatOptions has no "powerattack", did you mean "powerAttack"?',
        jasmine.stringMatching(/^error: adjustments\.melee\.\*\.toHit: an attack has no field "toHit", it is one of: type, name, damage, toHitAbility, toHitBonus/) as any,
        'error: adjustments.saves.wil: saves has no field "wil", did you mean "will"?',
      ]);
    });

    it('finds a whole skill or group adjusted instead of a field of it', () => {
      expect(messages(only({'skills.intimidate': 2, abilityScores: {str: 2}}))).toEqual([
        'error: adjustments.skills.intimidate: skills.intimidate is a whole skill, adjust a field of it: .value (a bonus), .ranks or .classSkill',
        'error: adjustments.abilityScores: abilityScores is a group, adjust one of its fields (abilityScores.<field>), see the reference',
      ]);
    });

    it('finds values the field can not take', () => {
      expect(messages(only({senses: 3, 'denyDexBonus.ac': 1, bab: 'half', ac: 'two', hp: true}))).toEqual([
        'error: adjustments.senses: senses takes text, not number 3',
        'error: adjustments.denyDexBonus.ac: denyDexBonus.ac takes true or false, not number 1',
        'error: adjustments.bab: "half" only slows a speed (speed.land, ...)',
        'error: adjustments.ac: "two" is not a number, a formula or one of half, reduced, auto-fail, the engine adds it as text',
        'error: adjustments.hp: hp takes a number or a formula, not boolean true',
      ]);
    });

    it('finds mistakes in adjustments given as objects', () => {
      expect(messages(only({
        ac: {value: 2, tpye: 'deflection'},
        maxDexBonus: {value: 3, mode: 'cap'},
        'saves.will': {value: 2, type: 'moral'},
        senses: {value: 'scent', mode: 'set'},
        'saves.fort[vs. poison]': {value: 2, mode: 'max'},
        cmd: {value: 2, type: 'deflection', mode: 'set'},
        init: {amount: 2},
        hp: {value: 1, if: ''},
      }))).toEqual([
        'error: adjustments.ac: an adjustment has no "tpye", the engine ignores it, did you mean "type"?',
        'error: adjustments.maxDexBonus: there is no mode "cap", the engine adds it instead, it is one of: add, set, min, max',
        'warning: adjustments.saves.will: "moral" is not a bonus type, it only stacks with others written the same way, did you mean "morale"?',
        'error: adjustments.senses: set only works on numbers, senses is not one',
        'warning: adjustments.saves.fort[vs. poison]: an adjustment with a variant ([vs. poison]) always adds, its mode max is ignored',
        'warning: adjustments.cmd: a bonus type only matters to adjustments that add, set ignores it',
        'error: adjustments.init: an adjustment given as an object needs a value: {"value": ..., "type": ..., "mode": ...} (it is called value)',
        'error: adjustments.hp: if takes the name of a feature or a list of names',
      ]);
    });

    it('finds formulas that can not be worked out, reference nothing or divide without rounding', () => {
      expect(messages(only({
        init: 'floor({bab}/4',
        hp: '{level}/2',
        cmb: '{abilityScores.strength}+1',
        cmd: 'sqrt({bab})',
        'saves.will': '{mod:bab}',
        ac: '{senses}+1',
      }))).toEqual([
        'error: adjustments.init: the formula "floor({bab}/4" can not be worked out: floor( is not closed',
        'warning: adjustments.hp: the formula "{level}/2" divides without rounding, pathfinder rounds down: floor(...) (ceil(...) for "1 per 2 levels, starting at 1st")',
        'error: adjustments.cmb: the formula "{abilityScores.strength}+1" references {abilityScores.strength}: abilityScores has no field "strength", did you mean "str"?',
        'error: adjustments.cmd: the formula "sqrt({bab})" can not be worked out: unknown function sqrt(), the functions are floor, ceil, round, abs, min, max',
        'warning: adjustments.saves.will: {mod:bab} takes the ability modifier of a number that is not an ability score, {mod:abilityScores.<ability>} is the modifier of an ability',
        'error: adjustments.ac: the formula "{senses}+1" references {senses}, which is not a number',
      ]);
    });

    it('finds fields the engine works out or the player keeps', () => {
      expect(messages(only({load: 'heavy', experience: 100}))).toEqual([
        'error: adjustments.load: load is worked out by the engine, adjusting it does nothing: worked out from the carried weight and the carrying capacity',
        "warning: adjustments.experience: experience is the player's to keep track of (experience points), a feature should not adjust it",
      ]);
    });

    it('finds a variant that is not at the end of the path', () => {
      expect(messages(only({'skills.perception[sight].value': -4}))).toEqual([
        'error: adjustments.skills.perception[sight].value: a variant goes at the end of the path in square brackets: skills.perception.value[sight]',
      ]);
    });

    it('checks the features an adjustment adds, and their adjustments', () => {
      expect(messages(only({feats: [{name: 'Dodge', adjustments: {acc: 1}}, 'Alertness'], conditions: {name: 'Fatigued'}}))).toEqual([
        'error: adjustments.feats[0].adjustments.acc: the character has no field "acc", did you mean "ac"?',
        'error: adjustments.feats[1]: a feature is an object: {name, description, adjustments}, not string "Alertness"',
      ]);
    });

    it('knows the skills of the character it is given', () => {
      const reference = new Character();
      reference.skills['craft'].subSkills = {pottery: {name: 'pottery', ranks: 1, value: 0, classSkill: false, baseAbility: 'int'}};
      expect(only({'skills.craft.subSkills.pottery.value': 1})).toEqual([]);
      expect(validateAdjustments({'skills.knowledge.subSkills.*.value': 1}, {reference})).toEqual([]);
    });
  });

  describe('validates features', () => {
    it('finds fields a feature does not have and charges it can not use', () => {
      expect(messages(validateFeature({nmae: 'Rage', adjustments: {}, charges: {total: 3}}))).toEqual([
        'warning: feature: a feature has no field "nmae", the engine ignores it, did you mean "name"?',
        'warning: feature: the feature has no name, the tooltips show where a number comes from by it',
        'error: feature.charges: charges are {"total": <number>, "current": <number>, "per": "day" | "encounter" | "none"}',
      ]);
    });

    it('takes a feature made by the app', () => {
      expect(validateFeature(new Feature({name: 'New'}))).toEqual([]);
    });
  });

  describe('validates characters', () => {
    it('finds nothing wrong with the example characters', () => {
      expect(formatProblems(validateCharacter(exampleCharacter))).toBe('');
      expect(formatProblems(validateCharacter(exampleCleric))).toBe('');
    });

    it('says where on the character each problem is', () => {
      const char = {
        classLevels: [{name: 'Fighter', features: [{name: 'Bravery', adjustments: {'saves.wil': 1}}]}],
        race: {features: [{name: 'Darkvision', adjustments: {sense: 'darkvision'}}]},
        inventory: [{name: 'Belt', features: [{name: 'Belt', adjustments: {'abilityScores.Str': 2}}]}],
      };
      expect(validateCharacter(char).map(p => p.path)).toEqual([
        'classLevels[0].features[0].adjustments.saves.wil',
        'race.features[0].adjustments.sense',
        'inventory[0].features[0].adjustments.abilityScores.Str',
      ]);
      expect(hasErrors(validateCharacter(char))).toBeTrue();
    });

    it('finds nothing wrong with the conditions of the app', () => {
      const conditions = new ConditionsService().list;
      const problems = conditions.flatMap((c, i) => validateFeature(c, {}, `conditions[${i}] ${c.name}`));
      expect(formatProblems(problems.filter(p => p.severity === 'error'))).toBe('');
    });
  });

  it('suggests only what is close to what was written', () => {
    expect(closest('perceptoin', ['perception', 'stealth'])).toBe('perception');
    expect(closest('STR', ['str', 'dex'])).toBe('str');
    expect(closest('fly', ['acrobatics', 'stealth'])).toBeUndefined();
  });
});

describe('adjustment reference', () => {
  const text = adjustmentReference();

  it('lists every field that can be adjusted and every bonus type', () => {
    for (const [path, doc] of Object.entries(characterFields)) {
      if (doc.kind !== 'derived' && doc.kind !== 'state' && path !== 'saves.conditional') {
        expect(text).withContext(path).toContain('`' + path + '`');
      }
    }
    for (const type of Object.keys(bonusTypes)) expect(text).withContext(type).toContain('`' + type + '`');
    expect(text).toContain('`abilityScores.str`');
    expect(text).toContain('`speed.land`');
    expect(text).toContain('`sense motive`');
  });

  it('lists the fields that can not be adjusted', () => {
    expect(text).toContain('| `load` | worked out by the engine');
    expect(text).toContain('| `experience` | kept by the player');
  });

  it('gives examples the engine can use', () => {
    for (const {feature} of referenceExamples) {
      expect(formatProblems(validateFeature(feature))).withContext(feature.name).toBe('');
      expect(text).toContain(`"name": "${feature.name}"`);
    }
  });

  describe('gives examples that do what they say', () => {
    let service: ApplyCharacterService;
    const example = (name: string): Feature =>
      new Feature(JSON.parse(JSON.stringify(referenceExamples.find(e => e.feature.name === name)!.feature)));
    const apply = (features: Feature[], setup: (char: Character) => void = () => {}): Character => {
      const char = new Character();
      setup(char);
      char.feats.push(...features);
      service.initializeCharacter(char);
      return service.applied();
    };

    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ApplyCharacterService);
    });

    it('scales toughness with the level', () => {
      const levels = (n: number) => (char: Character) => {
        char.classLevels = Array.from({length: n}, () => new ClassLevel({name: 'Fighter', hitDice: 10}));
      };
      const base = (n: number) => apply([], levels(n)).hp;
      expect(apply([example('Toughness')], levels(1)).hp - base(1)).toBe(3);
      expect(apply([example('Toughness')], levels(5)).hp - base(5)).toBe(5);
    });

    it('makes a halfling small and slow', () => {
      const applied = apply([example('Halfling')]);
      expect(applied.size).toBe(3);
      expect(applied.speed.land).toBe(20);
      expect(applied.abilityScores.dex).toBe(12);
      expect(applied.skills['acrobatics'].value).toBe(2);
    });

    it('caps the dex bonus with chainmail', () => {
      const applied = apply([example('Chainmail')]);
      expect(applied.maxDexBonus).toBe(2);
      expect(applied.armorCheckPenalty).toBe(-5);
    });

    it('does not stack the morale bonus of rage with another morale bonus', () => {
      const heroism = new Feature({name: 'Good Hope', adjustments: {'saves.will': {value: 2, type: 'morale'}}});
      expect(apply([example('Rage'), heroism]).saves.will).toBe(2);
    });

    it('applies an adjustment only while the feature it names is active', () => {
      expect(apply([example('Raging Vitality')]).abilityScores.con).toBe(10);
      expect(apply([example('Raging Vitality'), example('Rage')]).abilityScores.con).toBe(16);
    });

    it('adds a caster with its spells per day', () => {
      const applied = apply([example('Cleric Spells')]);
      expect(applied.spells['Cleric'].casterLevel).toBe(1);
      expect(applied.spells['Cleric'].spells[1].perDay.total).toBe(1);
    });

    it('adds damage reduction and energy resistance', () => {
      const applied = apply([example('Stoneskin')]);
      expect(applied.damageReduction['adamantine']).toBe(10);
      expect(applied.energyResistance.fire).toBe(10);
    });
  });
});
