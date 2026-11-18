import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { createFeature } from './builders';
import { addClassLevel } from './level-up';
import { runAiTool } from './ai-tools';

// the AI writing the rules of a feature as adjustments, shown where the player reads them: a slayer's first level
describe('feature mechanics', () => {
  let service: ApplyCharacterService;
  const slayer = (features: object[]) => addClassLevel(service, {
    class_name: 'Slayer', hit_die: 10, bab: 'full', good_saves: 'fort,ref', skill_ranks: 6,
    class_skills: 'perception,survival,bluff', based_on: 'own knowledge', features: JSON.stringify(features),
  }) as any;
  const studiedTarget = {
    name: 'Studied Target', description: 'move action: bonuses against one creature',
    adjustments: {specialAttack: {
      name: 'Studied Target', description: '+1 attack, damage and some skills vs. the target', active: false,
      adjustments: {'melee.*.toHitBonus': '1+floor({level.slayer}/5)', 'skills.perception.value': '1+floor({level.slayer}/5)'},
    }},
  };
  const track = {
    name: 'Track', description: '+1/2 level on Survival to follow tracks',
    adjustments: {
      'skills.survival.value[follow tracks]': 'max(1, floor({level.slayer}/2))',
      specialQuality: {name: 'Track', description: '+1/2 slayer level to follow tracks'},
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(new Character());
  });

  it('refuses class features that adjust nothing, with how to write them', () => {
    const result = slayer([{name: 'Studied Target', description: 'bonuses vs. a target', adjustments: {}}, {name: 'Track', description: 'x'}]);
    expect(result.error).toContain('need their rules as adjustments');
    expect(result.problems.join(' ')).toContain('Studied Target adjusts nothing');
    expect(result.problems.join(' ')).toContain('Track adjusts nothing');
    expect(result.how).toContain('{level.slayer}');
    expect(service.raw().classLevels.length).toBe(0);
  });

  it('refuses a class feature that would not show on the sheet, or whose toggle would hide it', () => {
    const hidden = slayer([{name: 'Track', adjustments: {'skills.survival.value[follow tracks]': 1}}]);
    expect(hidden.problems[0]).toContain('does not show on the sheet');
    const toggled = slayer([{name: 'Studied Target', active: false, adjustments: {'skills.perception.value': 1, specialAttack: {name: 'Studied Target'}}}]);
    expect(toggled.problems[0]).toContain('its toggle would hide it');
    // a bonus feat is counted, not shown
    expect(slayer([{name: 'Bonus Feat', adjustments: {bonusFeats: 1}}]).done).toContain('Slayer 1');
  });

  it('takes studied target as a special attack the player switches on, and track as a special quality', async () => {
    expect(slayer([studiedTarget, track]).done).toBe('level 1: Slayer 1 with Studied Target, Track (from memory, check it)');
    let applied = service.applied();
    expect(applied.specialAttack.map(f => [f.name, f.active])).toEqual([['Studied Target', false]]);
    expect(applied.specialQuality.map(f => f.name)).toEqual(['Track']);
    expect(applied.skills.perception.value).toBe(0);
    expect(await runAiTool('set_feature_active', {name: 'Studied Target', active: true}, {character: service} as any))
      .toEqual({done: 'Studied Target is on'});
    applied = service.applied();
    expect(applied.skills.perception.value).toBe(1);
    service.setFeatureActive(applied.specialAttack[0], false);
    expect(service.applied().skills.perception.value).toBe(0);
  });

  it('keeps a feature that changes no number only when it says why, without the mark', () => {
    expect(slayer([{name: 'Weapon Proficiency', adjustments: {}, descriptionOnly: 'the class level gives it'}]).done).toContain('Slayer 1');
    expect(Object.keys(service.raw().classLevels[0].features[0])).not.toContain('descriptionOnly');
    expect(createFeature(service, {list: 'feats', name: 'Mask of Virtue', adjustments: '{}', based_on: 'own knowledge'}).error)
      .toContain('adjusts nothing');
  });
});
