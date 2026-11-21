import {Feature} from '../interfaces/character.interface';
import {formulasPutRight} from './class-formulas';

describe('the formulas of known class features', () => {
  const feature = (f: object) => new Feature(f as Partial<Feature>);

  it('keeps Track\'s half level to at least 1, on the feature or its entry', () => {
    const track = feature({name: 'Track', adjustments: {specialQuality: {name: 'Track', adjustments: {'skills.survival.value[follow tracks]': 'floor({level.slayer}/2)'}}}});
    expect(formulasPutRight(track, 'Slayer')).toEqual([jasmine.stringContaining('"max(1, floor({level.slayer}/2))" on skills.survival.value[follow tracks]')]);
    expect((track.adjustments as any).specialQuality.adjustments['skills.survival.value[follow tracks]']).toBe('max(1, floor({level.slayer}/2))');
    // right already: nothing to say
    expect(formulasPutRight(track, 'Slayer')).toEqual([]);
    const ranger = feature({name: 'Track', adjustments: {'skills.survival.value[follow tracks]': {value: 0, type: 'untyped'}}});
    formulasPutRight(ranger, 'Ranger');
    expect((ranger.adjustments as any)['skills.survival.value[follow tracks]']).toEqual({value: 'max(1, floor({level.ranger}/2))', type: 'untyped'});
  });

  it('makes Studied Target grow every 5 levels, on its attacks, damage and skills', () => {
    const studied = feature({name: 'Studied Target', adjustments: {specialAttack: {name: 'Studied Target', active: false, adjustments: {
      'melee.*.toHitBonus': 1, 'melee.*.damageBonus': 1}}}});
    const [note] = formulasPutRight(studied, 'Slayer');
    expect(note).toContain('added on ranged.*.toHitBonus');
    const on = (studied.adjustments as any).specialAttack.adjustments;
    expect(Object.keys(on).sort()).toEqual(['melee.*.damageBonus', 'melee.*.toHitBonus', 'ranged.*.damageBonus', 'ranged.*.toHitBonus',
      'skills.bluff.value', 'skills.knowledge.subSkills.*.value', 'skills.perception.value', 'skills.sense motive.value', 'skills.survival.value']);
    expect(new Set(Object.values(on))).toEqual(new Set(['1+floor({level.slayer}/5)']));
  });

  it('keeps any halved level to at least 1 when its text says minimum 1, and leaves the rest', () => {
    const hunter = feature({name: 'Hunter\'s Bond', description: '+1/2 level (minimum 1) to allies', adjustments: {'init': 'floor({level.hunter}/2)'}});
    expect(formulasPutRight(hunter, 'Hunter').length).toBe(1);
    expect((hunter.adjustments as any).init).toBe('max(1, floor({level.hunter}/2))');
    const bravery = feature({name: 'Bravery', description: '+1 vs fear at 2nd', adjustments: {'saves.will[vs. fear]': 'floor(({level.fighter}+2)/4)'}});
    expect(formulasPutRight(bravery, 'Fighter')).toEqual([]);
  });
});
