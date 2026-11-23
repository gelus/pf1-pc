import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { unmetRequirementsOf } from './prerequisites';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { addClassLevel } from '../ai/level-up';

// prestige classes: their requirements checked as their first level is taken, their "+1 level of existing
// spellcasting class" counted for the class it advances
describe('prestige classes', () => {
  let service: ApplyCharacterService;
  const wizard = (levels: number): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === 'Wizard')!;
    const char = Object.assign(new Character(), {name: 'Ezren', alignment: 'NG', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 4}))});
    char.abilityScores = {...char.abilityScores, int: 18};
    char.skills = {...char.skills, knowledge: {...char.skills['knowledge'], subSkills: {...char.skills['knowledge'].subSkills,
      arcana: {...char.skills['knowledge'].subSkills!['arcana'], ranks: 5}}}};
    char.feats = [new Feature({name: 'Combat Casting', adjustments: {}})];
    return char;
  };
  const eldritchKnight = (args: object = {}) => addClassLevel(service, {class_name: 'Eldritch Knight', rolled_hp: 7, hit_die: 10, bab: 'full',
    good_saves: 'fort', skill_ranks: 2, class_skills: 'climb,knowledge (arcana)', table_row: '{"bab": 1, "fort": 1, "ref": 0, "will": 0}',
    weapon_proficiencies: 'simple, martial', armor_proficiencies: 'none', features: 'none', based_on: 'own knowledge', prestige: true, ...args}) as any;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('reads requirements the way prestige class pages write them', () => {
    service.initializeCharacter(wizard(5));
    const applied = service.applied();
    expect(unmetRequirementsOf(applied, 'Alignment: any good. Skills: Knowledge (arcana) 5 ranks. Feats: Combat Casting. Spells: Able to cast 3rd-level arcane spells.')).toEqual([]);
    const unmet = unmetRequirementsOf(applied, 'Alignment: any evil. Skills: Stealth 5 ranks. Base attack bonus: +5. Spells: able to cast 4th-level arcane spells. Special: must have slain a dragon.');
    expect(unmet.join(' | ')).toContain('alignment any evil (the character is NG)');
    expect(unmet.join(' | ')).toContain('Stealth 5 ranks (the character has 0)');
    expect(unmet.join(' | ')).toContain('base attack bonus +5');
    expect(unmet.join(' | ')).toContain('able to cast 4th-level arcane spells (the character casts up to 3-level arcane spells)');
    expect(unmet.join(' ')).not.toContain('dragon');
  });

  it('refuses a prestige class whose requirements are not met, and keeps them on its first level', () => {
    service.initializeCharacter(wizard(5));
    expect(eldritchKnight({requirements: 'Base attack bonus: +6. Spells: able to cast 3rd-level arcane spells.'}).problems.join(' '))
      .toContain('does not meet the requirements of Eldritch Knight');
    const r = eldritchKnight({requirements: 'Spells: able to cast 3rd-level arcane spells.'});
    expect(r.done).toContain('Eldritch Knight 1');
    expect(service.raw().classLevels[5].requirements).toContain('3rd-level arcane');
  });

  it('advances the spells per day and caster level of the class its levels name, nothing else', () => {
    service.initializeCharacter(wizard(5));
    const before = service.applied().spells['wizard'];
    eldritchKnight({requirements: 'none'});
    const second = {features: '[]', rolled_hp: 6, table_row: '{"bab": 2, "fort": 1, "ref": 0, "will": 0}'};
    expect(eldritchKnight({advances_casting: 'wizard', ...second}).done).toContain('Eldritch Knight 2');
    const after = service.applied().spells['wizard'];
    expect(after.casterLevel).toBe(before.casterLevel + 1);
    expect(after.classLevel).toBe(6);
    expect(eldritchKnight({advances_casting: 'cleric', ...second, table_row: '{"bab": 3, "fort": 2, "ref": 1, "will": 1}'}).problems.join(' ')).toContain('its spellcasting classes are Wizard');
  });
});
