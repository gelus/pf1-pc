import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Adjustments, Feature } from '../interfaces/character.interface';
import { allImmunities, defensesRule, normalizeBypass } from './defenses';

describe('defenses rule', () => {
  let service: ApplyCharacterService;

  const feat = (name: string, adjustments: Adjustments) => new Feature({name, adjustments});

  const apply = (char: Character): Character => {
    service.ruleModules = [defensesRule];
    service.initializeCharacter(char);
    return service.applied();
  };

  const overwritten = (path: string) =>
    Object.fromEntries(service.adjustmentsMap[path].map(e => [e.origin, e.overwritten]));

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  describe('energy resistance', () => {
    it('keeps only the highest of two fire resistances and crosses the other out', () => {
      const char = new Character();
      char.feats.push(
        feat('Resist Energy', {'energyResistance.fire': 10}),
        feat('Fire Resistance', {'energyResistance.fire': 5}),
      );
      const applied = apply(char);
      expect(applied.energyResistance.fire).toBe(10);
      expect(overwritten('energyResistance.fire')).toEqual({'Resist Energy': false, 'Fire Resistance': true});
    });

    it('keeps resistances to different energies apart', () => {
      const char = new Character();
      char.feats.push(
        feat('Resist Fire', {'energyResistance.fire': 10}),
        feat('Resist Cold', {'energyResistance.cold': 5}),
      );
      expect(apply(char).energyResistance).toEqual({fire: 10, cold: 5});
    });

    it('counts the character\'s own resistance as a source', () => {
      const char = new Character();
      char.energyResistance = {fire: 20};
      char.feats.push(feat('Resist Fire', {'energyResistance.fire': 10}));
      expect(apply(char).energyResistance.fire).toBe(20);
      expect(overwritten('energyResistance.fire')).toEqual({'Resist Fire': true});
    });

    it('still caps the highest resistance', () => {
      const char = new Character();
      char.feats.push(
        feat('Resist Fire', {'energyResistance.fire': 10}),
        feat('Other', {'energyResistance.fire': 10}),
        feat('Dampened', {'energyResistance.fire': {value: 5, mode: 'min'}}),
      );
      expect(apply(char).energyResistance.fire).toBe(5);
    });
  });

  describe('damage reduction', () => {
    it('keeps the highest damage reduction of a bypass', () => {
      const char = new Character();
      char.feats.push(
        feat('Stoneskin-ish', {'damageReduction.magic': 5}),
        feat('Better', {'damageReduction.magic': 10}),
      );
      expect(apply(char).damageReduction).toEqual({magic: 10});
      expect(overwritten('damageReduction.magic')).toEqual({'Stoneskin-ish': true, Better: false});
    });

    it('keeps damage reductions of different bypasses, the one nothing overcomes first', () => {
      const char = new Character();
      char.damageReduction = {silver: 5};
      char.feats.push(
        feat('Magic', {'damageReduction.Magic': 5}),
        feat('Barbarian', {'damageReduction.—': 1}),
      );
      const dr = apply(char).damageReduction;
      expect(dr).toEqual({'-': 1, silver: 5, magic: 5});
      expect(Object.keys(dr)[0]).toBe('-');
    });

    it('counts the character\'s own damage reduction as a source', () => {
      const char = new Character();
      char.damageReduction = {'-': 10};
      char.feats.push(feat('Barbarian', {'damageReduction.-': 2}));
      expect(apply(char).damageReduction).toEqual({'-': 10});
      expect(overwritten('damageReduction.-')).toEqual({Barbarian: true});
    });

    it('treats every way of writing a bypass as the same', () => {
      expect(normalizeBypass('Silver and  good')).toBe('good and silver');
      expect(normalizeBypass('silver or cold iron')).toBe('cold iron or silver');
      expect(normalizeBypass('')).toBe('-');
      expect(normalizeBypass('–')).toBe('-');
      const char = new Character();
      char.feats.push(
        feat('A', {'damageReduction.good and silver': 10}),
        feat('B', {'damageReduction.silver and good': 5}),
        feat('C', {'damageReduction.': 3}),
        feat('D', {'damageReduction.–': 2}),
      );
      expect(apply(char).damageReduction).toEqual({'-': 3, 'good and silver': 10});
      expect(overwritten('damageReduction.silver and good')).toEqual({B: true});
      expect(overwritten('damageReduction.–')).toEqual({D: true});
    });

    it('takes typed bonuses, formulas, caps and conditions like any other value', () => {
      const raging = (active: boolean) => {
        const char = new Character();
        char.bab = 4;
        char.feats.push(
          new Feature({name: 'Rage', adjustments: {}, active}),
          feat('Raging Hide', {'damageReduction.-': {value: 2, if: 'Rage'}}),
          feat('Scaling', {'damageReduction.cold iron': '{bab}'}),
          feat('Ward', {'damageReduction.magic': {value: 5, type: 'enhancement'}}),
          feat('Dampened', {'damageReduction.magic': {value: 3, mode: 'min'}}),
        );
        return char;
      };
      expect(apply(raging(true)).damageReduction).toEqual({'-': 2, 'cold iron': 4, magic: 3});
      expect(apply(raging(false)).damageReduction).toEqual({'cold iron': 4, magic: 3});
    });

    describe('saved before it was kept by bypass', () => {
      it('migrates the character\'s own list of damage reductions when it is loaded', () => {
        const char = new Character() as any;
        char.damageReduction = [{value: 5, bypass: 'silver'}, {value: 10, bypass: '—'}, {value: 3, bypass: 'Silver'}];
        const applied = apply(char);
        expect(service.raw().damageReduction).toEqual({silver: 5, '-': 10});
        expect(applied.damageReduction).toEqual({'-': 10, silver: 5});
      });

      it('migrates the old damage reduction of a raw character set without loading it', () => {
        const char = new Character() as any;
        char.damageReduction = [{value: 5, bypass: 'magic'}];
        service.ruleModules = [defensesRule];
        service.raw.set(char);
        expect(service.applied().damageReduction).toEqual({magic: 5});
      });

      it('migrates the damage reduction features give when the character is loaded', () => {
        const char = new Character();
        char.feats.push(
          feat('Old', {damageReduction: {value: 5, bypass: 'magic'}} as any),
          feat('Old List', {damageReduction: [{value: 10, bypass: '-'}, {value: 5, bypass: 'silver and good'}]} as any),
          new Feature({name: 'Granting', adjustments: {
            defensiveAbilities: new Feature({name: 'Nested', adjustments: {damageReduction: {value: {value: 2, bypass: 'cold iron'}, if: 'Rage'}} as any}),
          }}),
        );
        apply(char);
        const feats = service.raw().feats;
        expect(feats[0].adjustments).toEqual({'damageReduction.magic': 5});
        expect(feats[1].adjustments).toEqual({'damageReduction.-': 10, 'damageReduction.good and silver': 5});
        expect((feats[2].adjustments['defensiveAbilities'] as Feature).adjustments)
          .toEqual({'damageReduction.cold iron': {value: 2, if: 'Rage'}});
      });

      it('applies the old damage reduction of a feature never migrated', () => {
        const raging = (active: boolean) => {
          const char = new Character();
          char.feats.push(
            new Feature({name: 'Rage', adjustments: {}, active}),
            feat('Old', {damageReduction: [{value: 5, bypass: 'magic'}, {value: 1, bypass: '-'}]} as any),
            feat('Raging Hide', {damageReduction: {value: {value: 2, bypass: '-'}, if: 'Rage'}} as any),
          );
          return char;
        };
        service.ruleModules = [defensesRule];
        service.raw.set(raging(true));
        expect(service.applied().damageReduction).toEqual({'-': 2, magic: 5});
        expect(overwritten('damageReduction.-')).toEqual({Old: true, 'Raging Hide': false});
        service.raw.set(raging(false));
        expect(service.applied().damageReduction).toEqual({'-': 1, magic: 5});
      });
    });
  });

  it('keeps the highest spell resistance', () => {
    const char = new Character();
    char.feats.push(feat('Drow', {spellResistance: 12}), feat('Spell Resistance', {spellResistance: 15}));
    expect(apply(char).spellResistance).toBe(15);
    expect(overwritten('spellResistance')).toEqual({Drow: true, 'Spell Resistance': false});
  });

  it('keeps the highest concealment', () => {
    const char = new Character();
    char.conditions.push(feat('Blur', {concealment: 20}), feat('Displacement', {concealment: 50}));
    expect(apply(char).concealment).toBe(50);
  });

  describe('immunities', () => {
    it('dedupes the immunities given, ignoring case', () => {
      const char = new Character();
      char.immunities = ['Poison'];
      char.feats.push(feat('Elemental', {immunities: ['poison', 'sleep']}), feat('Ring', {immunities: 'Sleep, fire'}));
      expect(apply(char).immunities).toEqual(['Poison', 'sleep', 'fire']);
    });

    it('keeps the old free text immunities of a saved character', () => {
      const char = new Character();
      char.immune = 'disease, mind-affecting effects (charms, compulsions)';
      char.feats.push(feat('Elemental', {immunities: ['Disease', 'paralysis']}));
      expect(allImmunities(apply(char))).toEqual(['disease', 'mind-affecting effects (charms, compulsions)', 'paralysis']);
    });
  });
});
