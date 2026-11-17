import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { BabProgression, ClassLevel, SaveName } from '../utils/classlevel.class';
import { Feature } from '../interfaces/character.interface';
import {
  availableFeats, babFor, classGroups, classProgressionModule, pendingAbilityIncreases, saveFor,
} from './class-progression';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { getSkillList, KNOWLEDGE_SPECIALTIES } from '../utils/skilllist.class';
import exampleCharacter from '../example-character.json';

// levels of a class, each entry one character level
const levels = (name: string, count: number, extra: Partial<ClassLevel> = {}): ClassLevel[] =>
  Array.from({length: count}, (_, i) => new ClassLevel({name, level: i + 1, ...extra}));

const progressed = (name: string, count: number, babProgression: BabProgression, goodSaves: SaveName[], extra: Partial<ClassLevel> = {}) =>
  levels(name, count, {babProgression, goodSaves, ...extra});

describe('class progression', () => {
  let service: ApplyCharacterService;

  const apply = (char: Character): Character => {
    service.ruleModules = [classProgressionModule];
    service.initializeCharacter(char);
    return service.applied();
  };

  const origins = (path: string): string[] => (service.adjustmentsMap[path] || []).map(e => e.origin);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  describe('base attack bonus', () => {
    it('works out each progression', () => {
      expect([1, 2, 3, 4, 20].map(l => babFor('full', l))).toEqual([1, 2, 3, 4, 20]);
      expect([1, 2, 3, 4, 20].map(l => babFor('threeQuarters', l))).toEqual([0, 1, 2, 3, 15]);
      expect([1, 2, 3, 4, 20].map(l => babFor('half', l))).toEqual([0, 1, 1, 2, 10]);
    });

    it('adds up the bab of each class on its own, Fighter 4 / Rogue 4 has 4 + 3', () => {
      const char = new Character();
      char.classLevels = [...progressed('Fighter', 4, 'full', ['fort']), ...progressed('Rogue', 4, 'threeQuarters', ['ref'])];
      expect(apply(char).bab).toBe(7);
      expect(origins('bab')).toEqual(['Fighter 4 (BAB)', 'Rogue 4 (BAB)']);
    });

    it('counts the entries of a class wherever they are, and takes its progression from the first entry giving one', () => {
      const char = new Character();
      char.classLevels = [
        new ClassLevel({name: 'Wizard', level: 1, babProgression: 'half'}),
        new ClassLevel({name: 'Fighter', level: 1, babProgression: 'full'}),
        new ClassLevel({name: 'wizard', level: 2}),
      ];
      // wizard 2 gives 1, fighter 1 gives 1
      expect(apply(char).bab).toBe(2);
      expect(origins('bab')).toEqual(['Wizard 2 (BAB)', 'Fighter 1 (BAB)']);
    });

    it('leaves the bab of a class without a progression to its features', () => {
      const char = new Character();
      char.classLevels = [new ClassLevel({name: 'Legacy', features: [new Feature({name: 'Legacy BAB', adjustments: {bab: 1}})]})];
      expect(apply(char).bab).toBe(1);
      expect(origins('bab')).toEqual(['Legacy BAB']);
    });
  });

  describe('saves', () => {
    it('works out good and poor saves', () => {
      expect([1, 2, 3, 4, 20].map(l => saveFor(true, l))).toEqual([2, 3, 3, 4, 12]);
      expect([1, 2, 3, 4, 20].map(l => saveFor(false, l))).toEqual([0, 0, 1, 1, 6]);
    });

    it('gives every class its own good saves, Fighter 1 / Wizard 1 has fort 2 + 0 and will 0 + 2', () => {
      const char = new Character();
      char.classLevels = [...progressed('Fighter', 1, 'full', ['fort']), ...progressed('Wizard', 1, 'half', ['will'])];
      const applied = apply(char);
      expect(applied.saves.fort).toBe(2);
      expect(applied.saves.ref).toBe(0);
      expect(applied.saves.will).toBe(2);
      expect(origins('saves.fort')).toEqual(['Fighter 1 (saves)']);
      expect(origins('saves.will')).toEqual(['Wizard 1 (saves)']);
    });

    it('stacks the good saves of every class, Fighter 2 / Ranger 2 has fort 3 + 3', () => {
      const char = new Character();
      char.classLevels = [...progressed('Fighter', 2, 'full', ['fort']), ...progressed('Ranger', 2, 'full', ['fort', 'ref'])];
      const applied = apply(char);
      expect(applied.saves.fort).toBe(6);
      expect(applied.saves.ref).toBe(3);
      expect(applied.saves.will).toBe(0);
    });

    it('gives a class with no good saves only poor ones, and leaves a class without saves given to its features', () => {
      const char = new Character();
      char.classLevels = [
        ...progressed('Commoner', 3, 'half', []),
        new ClassLevel({name: 'Legacy', features: [new Feature({name: 'Legacy saves', adjustments: {'saves.fort': 2}})]}),
      ];
      const applied = apply(char);
      expect(applied.saves.fort).toBe(1 + 2);
      expect(applied.saves.ref).toBe(1);
      expect(applied.saves.will).toBe(1);
    });
  });

  describe('hit points', () => {
    it('gives the first level its full hit die, the others what was rolled, and con for every level', () => {
      const char = new Character();
      char.abilityScores.con = 14;
      char.classLevels = [
        new ClassLevel({name: 'Fighter', level: 1, hitDice: 10, rolledHp: 3}),
        new ClassLevel({name: 'Fighter', level: 2, hitDice: 10, rolledHp: 7}),
        new ClassLevel({name: 'Rogue', level: 1, hitDice: 8, rolledHp: 5}),
      ];
      expect(apply(char).hp).toBe(10 + 7 + 5 + 2 * 3);
      expect(origins('hp')).toEqual(['Fighter 2 (hit dice)', 'Rogue 1 (hit dice)', 'Constitution (HP)']);
    });

    it('takes the final con, after every feature', () => {
      const char = new Character();
      char.classLevels = [new ClassLevel({name: 'Barbarian', hitDice: 12})];
      char.feats.push(new Feature({name: 'Bull', adjustments: {'abilityScores.con': {value: 14, mode: 'set'}}}));
      expect(apply(char).hp).toBe(14);
    });

    it('gives every level at least 1 hit point', () => {
      const char = new Character();
      char.abilityScores.con = 6;
      char.classLevels = [
        new ClassLevel({name: 'Wizard', level: 1, hitDice: 6}),
        new ClassLevel({name: 'Wizard', level: 2, hitDice: 6, rolledHp: 1}),
        new ClassLevel({name: 'Wizard', level: 3, hitDice: 6, rolledHp: 3}),
      ];
      // 6 - 2, 1 - 2 is raised to 1, 3 - 2
      expect(apply(char).hp).toBe(4 + 1 + 1);
      expect(service.adjustmentsMap['hp'].find(e => e.origin === 'Minimum 1 HP per level')?.value).toBe(2);
    });

    it('adds a hit point for every favored class level taking the hit point bonus', () => {
      const char = new Character();
      char.favoredClasses = ['Fighter'];
      char.classLevels = [
        new ClassLevel({name: 'Fighter', level: 1, hitDice: 10, favoredClassBonus: 'hp'}),
        new ClassLevel({name: 'Fighter', level: 2, hitDice: 10, rolledHp: 5, favoredClassBonus: 'skill'}),
        new ClassLevel({name: 'Fighter', level: 3, hitDice: 10, rolledHp: 5, favoredClassBonus: 'hp'}),
        // not a favored class
        new ClassLevel({name: 'Rogue', level: 1, hitDice: 8, rolledHp: 4, favoredClassBonus: 'hp'}),
      ];
      expect(apply(char).hp).toBe(10 + 5 + 5 + 4 + 2);
      expect(service.adjustmentsMap['hp'].find(e => e.origin === 'Favored class (HP)')?.value).toBe(2);
    });

    it('keeps the hit points features give', () => {
      const char = new Character();
      char.classLevels = [new ClassLevel({name: 'Fighter', hitDice: 10})];
      char.feats.push(new Feature({name: 'Toughness', adjustments: {hp: 3}}));
      expect(apply(char).hp).toBe(13);
      expect(origins('hp')).toContain('Toughness');
    });
  });

  describe('ability score increases', () => {
    it('raises the score picked at every 4th character level, and only there', () => {
      const char = new Character();
      char.classLevels = levels('Fighter', 8).map((entry, i) => ({...entry, abilityIncrease: i === 3 || i === 7 || i === 1 ? 'str' : undefined}));
      const applied = apply(char);
      expect(applied.abilityScores.str).toBe(12);
      expect(origins('abilityScores.str')).toEqual(['Level 4 ability increase', 'Level 8 ability increase']);
    });

    it('counts the increases owed that have no score picked', () => {
      const char = new Character();
      char.classLevels = levels('Fighter', 3);
      expect(pendingAbilityIncreases(char)).toBe(0);
      char.classLevels = levels('Fighter', 9);
      expect(pendingAbilityIncreases(char)).toBe(2);
      char.classLevels[3].abilityIncrease = 'dex';
      expect(pendingAbilityIncreases(char)).toBe(1);
      char.classLevels[7].abilityIncrease = 'nonsense';
      expect(pendingAbilityIncreases(char)).toBe(1);
    });
  });

  it('gives a feat every odd character level, plus the bonus feats', () => {
    const char = new Character();
    expect(availableFeats(char)).toBe(0);
    char.classLevels = levels('Fighter', 1);
    expect(availableFeats(char)).toBe(1);
    char.classLevels = levels('Fighter', 2);
    expect(availableFeats(char)).toBe(1);
    char.classLevels = levels('Fighter', 3);
    char.bonusFeats = 2;
    expect(availableFeats(char)).toBe(4);
  });

  it('lets features add bonus feats', () => {
    const char = new Character();
    char.race.features.push(new Feature({name: 'Bonus Feat', adjustments: {bonusFeats: 1}}));
    expect(apply(char).bonusFeats).toBe(1);
  });

  it('merges the proficiencies of every class and feature, once each, in lowercase', () => {
    const char = new Character();
    char.classLevels = [
      new ClassLevel({name: 'Fighter', proficiencies: {weapons: ['simple', 'martial'], armor: ['light', 'medium', 'heavy', 'shield']}}),
      new ClassLevel({name: 'Rogue', proficiencies: {weapons: ['Simple', 'hand crossbow'], armor: ['light']}}),
    ];
    char.feats.push(new Feature({name: 'Exotic Weapon Proficiency', adjustments: {'proficiencies.weapons': 'Bastard Sword'}}));
    char.feats.push(new Feature({name: 'Tower Shield Proficiency', adjustments: {'proficiencies.armor': ['tower shield']}}));
    const applied = apply(char);
    expect(applied.proficiencies.weapons).toEqual(['simple', 'martial', 'hand crossbow', 'bastard sword']);
    expect(applied.proficiencies.armor).toEqual(['light', 'medium', 'heavy', 'shield', 'tower shield']);
    expect(origins('proficiencies.weapons')).toContain('Fighter (proficiencies)');
  });

  it('groups the entries by class, ignoring case', () => {
    const groups = classGroups([...levels('Fighter', 2), ...levels('rogue', 1), new ClassLevel({name: 'fighter ', level: 3})]);
    expect(groups.map(g => [g.name, g.entries.length])).toEqual([['Fighter', 3], ['rogue', 1]]);
  });

  it('gives the barbarian of the example its bab, saves and hit points from its progression', () => {
    const applied = apply(JSON.parse(JSON.stringify(exampleCharacter)));
    expect(applied.bab).toBe(1);
    expect(applied.saves.fort).toBe(2);
    expect(applied.saves.ref).toBe(0);
    // will gets the morale bonus of rage
    expect(applied.saves.will).toBe(2);
    expect(origins('bab')).toEqual(['Barbarian 1 (BAB)']);
    // a d12, and con 14 + 2 racial + 4 rage
    expect(applied.hp).toBe(12 + 5);
    expect(applied.proficiencies.weapons).toEqual(['simple', 'martial']);
  });

  describe('class presets', () => {
    const skills = Object.keys(getSkillList()).flatMap(skill =>
      skill === 'knowledge' ? ['knowledge', ...KNOWLEDGE_SPECIALTIES.map(spec => `knowledge (${spec})`)] : [skill]
    );

    it('has the 11 core classes, with class skills the skill list knows', () => {
      expect(CLASS_PRESETS.map(p => p.name.toLowerCase())).toEqual([
        'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'wizard',
      ]);
      for (const preset of CLASS_PRESETS) {
        for (const skill of preset.classSkills) expect(skills).withContext(preset.name).toContain(skill);
      }
    });

    it('fills a level entry, proficiencies on the first level of the class and wealth on the first character level', () => {
      const fighter = CLASS_PRESETS.find(p => p.name === 'Fighter')!;
      const first = classLevelFromPreset(fighter, 1, true);
      expect(first.hitDice).toBe(10);
      expect(first.babProgression).toBe('full');
      expect(first.goodSaves).toEqual(['fort']);
      expect(first.startingWealth).toBe(175);
      expect(first.proficiencies?.armor).toContain('tower shield');
      const second = classLevelFromPreset(fighter, 2, false);
      expect(second.startingWealth).toBe(0);
      expect(second.proficiencies).toBeUndefined();
    });

    it('works out a Fighter 2 / Rogue 1 made from presets', () => {
      const fighter = CLASS_PRESETS.find(p => p.name === 'Fighter')!;
      const rogue = CLASS_PRESETS.find(p => p.name === 'Rogue')!;
      const char = new Character();
      char.abilityScores.con = 12;
      char.classLevels = [
        classLevelFromPreset(fighter, 1, true),
        {...classLevelFromPreset(fighter, 2, false), rolledHp: 6},
        {...classLevelFromPreset(rogue, 1, false), rolledHp: 4},
      ];
      const applied = apply(char);
      expect(applied.bab).toBe(2 + 0);
      expect(applied.saves.fort).toBe(3 + 0);
      expect(applied.saves.ref).toBe(0 + 2);
      expect(applied.saves.will).toBe(0);
      expect(applied.hp).toBe(10 + 6 + 4 + 3);
      expect(applied.proficiencies.weapons).toEqual(['simple', 'martial', 'hand crossbow', 'rapier', 'sap', 'shortbow', 'short sword']);
    });
  });
});
