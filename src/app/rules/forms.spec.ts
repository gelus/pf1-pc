import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature, Spell } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';
import { Armor, Item, Weapon } from '../utils/item.class';
import { MeleeAttack } from '../utils/attack.class';
import { createFeature } from '../ai/builders';
import { formFrom } from './forms';

// changing shape by the polymorph rules: one form at a time, the gear melded, the original form's attacks, movement
// and senses set aside, a form's own attack dice for its creature's size
describe('forms', () => {
  let service: ApplyCharacterService;
  const natural = (name: string, damage: string, sizedFor = '') =>
    Object.assign(new MeleeAttack(), {name, type: 'natural', damage, toHitAbility: 'str', damageAbility: 'str', sizedFor});
  const tiger = (active: boolean) => new Feature({name: 'Tiger form', description: 'beast shape II, a Large tiger', active,
    form: {meldsGear: true, noCasting: true, from: 'Beast Shape II'},
    adjustments: {size: {value: 5, mode: 'set'}, 'abilityScores.str': {value: 4, type: 'size'}, ac: {value: 4, type: 'natural armor'},
      melee: [natural('Bite', '2d6', 'Large')], 'speed.land': {value: 40, mode: 'set'}, senses: 'low-light vision, scent'} as any});
  const character = (...conditions: Feature[]): Character => {
    const char = new Character();
    char.bab = 3;
    char.race.features = [new Feature({name: 'Racial stats', adjustments: {'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}} as any}),
      new Feature({name: 'Darkvision', adjustments: {senses: 'darkvision 60 ft.'} as any}),
      new Feature({name: 'Climber', adjustments: {'speed.climb': {value: 20, mode: 'set'}} as any}),
      new Feature({name: 'Claws', adjustments: {melee: [natural('Claw', '1d4')]} as any})];
    const sword = Object.assign(new Weapon(), {id: 'sword', name: 'Longsword', equipped: true});
    (sword.features[0].adjustments as any).melee[0] = Object.assign(new MeleeAttack(), {name: 'Longsword', damage: '1d8', toHitAbility: 'str', damageAbility: 'str'});
    const shirt = Object.assign(new Armor(), {id: 'shirt', name: 'Chain shirt', equipped: true, armorCategory: 'light'});
    shirt.features = [new Feature({name: 'Chain shirt', adjustments: {ac: {value: 4, type: 'armor'}, armorCheckPenalty: -2} as any})];
    const cloak = Object.assign(new Item(), {id: 'cloak', name: 'Cloak of resistance +1', equipped: true, slot: 'shoulders',
      features: [new Feature({name: 'Cloak', adjustments: {savingThrowBonus: {value: 1, type: 'resistance'}} as any})]});
    const bracers = Object.assign(new Item(), {id: 'bracers', name: 'Bracers of armor +1', equipped: true, slot: 'wrists',
      features: [new Feature({name: 'Bracers', adjustments: {ac: {value: 1, type: 'armor'}} as any})]});
    char.inventory = [sword, shirt, cloak, bracers];
    char.conditions = conditions;
    return char;
  };
  const apply = (char: Character) => { service.initializeCharacter(char); return service.applied(); };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('changes nothing while the form is off', () => {
    const applied = apply(character(tiger(false)));
    expect(applied.setAside).toBeUndefined();
    expect(applied.melee.map(a => a.name)).toEqual(['Claw', 'Longsword']);
    expect(applied.armorCheckPenalty).toBe(-2);
  });

  it('melds the gear and sets the original form aside while it is on', () => {
    const applied = apply(character(tiger(true)));
    expect(applied.setAside!.form).toBe('Tiger form');
    // the bracers' armor bonus stops too, the cloak is not melded
    expect(applied.setAside!.items.map(i => i.name)).toEqual(['Longsword', 'Chain shirt', 'Bracers of armor +1']);
    expect(applied.setAside!.attacks).toEqual(['Longsword']);
    expect(applied.setAside!.original).toEqual(['Darkvision (senses)', 'Climber (climb)', 'Claws (natural attacks)']);
    // no armor bonus or penalty from the melded shirt, the cloak's constant bonus goes on
    expect((service.adjustmentsMap['ac'] || []).some(e => e.origin === 'Chain shirt')).toBeFalse();
    expect(applied.armorCheckPenalty).toBe(0);
    expect(applied.savingThrowBonus).toBe(1);
    // the form's attacks and senses, not the original's; the bite as the Large tiger has it
    expect(applied.melee.map(a => a.name)).toEqual(['Bite']);
    expect(applied.melee[0].result!.damage.dice).toBe('2d6');
    expect(applied.speed.climb).toBeFalsy();
    expect(applied.senses).not.toContain('darkvision');
    expect(applied.size).toBe(5);
  });

  it('keeps the gear of a form that does not meld it (alter self)', () => {
    const human = new Feature({name: 'Alter self', active: true, form: {}, adjustments: {'skills.disguise.value': 10} as any});
    const applied = apply(character(human));
    expect(applied.setAside!.items).toEqual([]);
    expect(applied.melee.map(a => a.name)).toEqual(['Longsword']);
  });

  it('is in one form at a time: the last switched on, and switching one on ends the others', () => {
    const eagle = new Feature({...tiger(true), id: 'eagle', name: 'Eagle form'});
    expect(apply(character(tiger(true), eagle)).setAside!.form).toBe('Eagle form');
    apply(character(tiger(false), new Feature({...eagle, active: false})));
    service.setFeatureActive(service.raw().conditions[0], true);
    service.setFeatureActive(service.raw().conditions[1], true);
    expect(service.raw().conditions.map(c => c.active)).toEqual([false, true]);
  });

  it('warns of a spell with verbal or somatic components in a form with no hands or voice for it', () => {
    const char = character(tiger(true));
    const spell = {name: 'Cure Light Wounds', level: 1, school: 'conjuration', components: ['V', 'S']} as unknown as Spell;
    char.spells = {druid: {name: 'druid', ability: 'wis', casterLevel: 3, concentration: 3, spells: [
      {perDay: {total: 3, current: 3}, spells: []}, {perDay: {total: 2, current: 2}, spells: [spell]}]}} as any;
    apply(char);
    expect(service.cast('spells', 'druid', 1, spell).warning).toContain('in Tiger form');
    service.update({castsInAnyForm: true});
    expect(service.cast('spells', 'druid', 1, spell).warning).toBeUndefined();
  });

  it('is built by the AI as a condition kept off, with what the form does', () => {
    apply(character());
    expect(formFrom('{"melds_gear": true, "from": "Wild Shape"}')).toEqual({meldsGear: true, from: 'Wild Shape'});
    const done = createFeature(service, {list: 'conditions', name: 'Wolf form', based_on: 'own knowledge', description: 'beast shape I, a wolf',
      adjustments: '{"abilityScores.dex": {"value": 2, "type": "size"}, "ac": {"value": 2, "type": "natural armor"}}',
      form: '{"melds_gear": true, "no_casting": true, "from": "Beast Shape I"}'}) as any;
    expect(done.done).toContain('Wolf form');
    const wolf = service.raw().conditions.find(c => c.name === 'Wolf form')!;
    expect(wolf.form).toEqual({meldsGear: true, noCasting: true, from: 'Beast Shape I'});
    expect(wolf.active).toBeFalse();
  });
});
