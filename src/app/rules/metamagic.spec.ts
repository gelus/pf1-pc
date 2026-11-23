import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature, Spell } from '../interfaces/character.interface';
import { CLASS_PRESETS, classLevelFromPreset } from './class-presets';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { castSpell } from '../ai/play-actions';
import { prepareSpells } from '../ai/spells';
import { createFeature } from '../ai/builders';

// metamagic: a spell in a slot its metamagic feats raise it to, prepared there or spent from there
describe('metamagic', () => {
  let service: ApplyCharacterService;
  const fireball = {name: 'Fireball', school: 'evocation', components: ['V', 'S', 'M'], savingThrow: 'Reflex half'} as unknown as Spell;
  const missile = {name: 'Magic Missile', school: 'evocation', components: ['V', 'S'], savingThrow: 'none'} as unknown as Spell;
  const caster = (className: string, levels: number): Character => {
    const preset = CLASS_PRESETS.find(p => p.name === className)!;
    const char = Object.assign(new Character(), {name: 'Ezren', classLevels: Array.from({length: levels}, (_, i) =>
      new ClassLevel({...classLevelFromPreset(preset, i + 1, i === 0), rolledHp: 4}))});
    char.abilityScores = {...char.abilityScores, int: 20, cha: 20};
    char.feats = [
      new Feature({name: 'Empower Spell', metamagic: {levels: 2}, adjustments: {}}),
      new Feature({name: 'Heighten Spell', metamagic: {levels: 0, heightens: true}, adjustments: {}}),
    ];
    return char;
  };
  const withSpells = (char: Character, origin: string) => {
    service.initializeCharacter(char);
    service.saveSpell('spells', origin, 3, fireball);
    service.saveSpell('spells', origin, 1, missile);
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('prepares a spell with metamagic in the slot its feats raise it to', () => {
    withSpells(caster('Wizard', 9), 'wizard');
    expect(service.prepareSpell('wizard', 4, 'Fireball', 'regular', ['Empower Spell'])).toBe('Fireball (Empower Spell) takes a level 5 slot');
    expect(service.prepareSpell('wizard', 5, 'Fireball', 'regular', ['Empower Spell'])).toBeUndefined();
    expect(service.prepareSpell('wizard', 5, 'Fireball', 'regular', ['Quicken Spell'])).toContain('no metamagic feat Quicken Spell');
    const prepared = service.raw().spells['wizard'].spells[5].prepared!;
    expect(prepared).toEqual([{name: 'Fireball', metamagic: ['Empower Spell'], level: 3}]);
    // a heightened spell to any level up from its own
    expect(service.prepareSpell('wizard', 4, 'Magic Missile', 'regular', ['Heighten Spell'])).toBeUndefined();
    // cast from its slot
    const cast = service.cast('spells', 'wizard', 5, fireball, {preparedIndex: 0});
    expect(cast.spent).toBeTrue();
    expect(service.raw().spells['wizard'].spells[5].prepared![0].cast).toBeTrue();
  });

  it('spends a spontaneous caster\'s slot of the raised level, as a full-round action', () => {
    withSpells(caster('Sorcerer', 10), 'sorcerer');
    const before = service.applied().spells['sorcerer'].spells[5].perDay.current;
    const cast = service.cast('spells', 'sorcerer', 3, fireball, {metamagic: ['Empower Spell']});
    expect(cast.level).toBe(5);
    expect(cast.spell).toBe('Fireball (Empower Spell)');
    expect(cast.note).toContain('full-round action');
    expect(service.applied().spells['sorcerer'].spells[5].perDay.current).toBe(before - 1);
  });

  it('is the AI\'s too: metamagic feats, preparing and casting with them', () => {
    const char = caster('Wizard', 9);
    char.feats = [];
    withSpells(char, 'wizard');
    expect((createFeature(service, {list: 'feats', name: 'Empower Spell', description: 'numeric effects x1.5, +2 levels',
      description_only: 'its effect is judged at the table', adjustments: '{}', metamagic_levels: 2, based_on: 'own knowledge'}) as any).done).toBeDefined();
    expect(service.raw().feats[0].metamagic).toEqual({levels: 2});
    expect((prepareSpells(service, {caster: 'wizard', level: 5, spells: 'Fireball', metamagic: 'Empower Spell'}) as any).preparedNow)
      .toEqual(['Fireball (Empower Spell)']);
    const cast = castSpell(service, 'Fireball', {metamagic: 'Empower Spell'}) as any;
    expect(cast.done).toBe('cast Fireball');
    expect(cast.cast.level).toBe(5);
  });
});
