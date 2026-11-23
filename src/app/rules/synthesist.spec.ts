import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { CharacterRegistry } from '../character-registry.service';
import { Feature } from '../interfaces/character.interface';
import { MeleeAttack } from '../utils/attack.class';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { Armor, Item } from '../utils/item.class';
import { ls } from '../utils/localstorage.util';
import { setCompanion } from '../party/companion-actions';
import { explainStat } from '../ai/character-reader';

// a synthesist fused with its eidolon: the eidolon's physical scores, attack bonus, natural armor, evolutions and hit
// points (as temporary hp), its own mind, saves and gear but not its armor; its "while fused" features on
describe('synthesist', () => {
  let registry: CharacterRegistry;
  let open: ApplyCharacterService;
  const saved: string[] = [];
  const summoner = (): Character => {
    const char = Object.assign(new Character(), {name: 'Balazar', classLevels: [1, 2, 3, 4, 5].map(n =>
      new ClassLevel({name: 'Summoner', level: n, hitDice: 8, babProgression: 'threeQuarters', goodSaves: ['will'], skillRanks: 2, rolledHp: 5}))});
    char.abilityScores = {str: 10, dex: 12, con: 12, int: 12, wis: 10, cha: 16} as any;
    char.race.features = [new Feature({name: 'Human', adjustments: {size: {value: 4, mode: 'set'}, 'speed.land': {value: 30, mode: 'set'}} as any})];
    const shirt = Object.assign(new Armor(), {id: 'shirt', name: 'Chain shirt', equipped: true, armorCategory: 'light',
      features: [new Feature({name: 'Chain shirt', adjustments: {ac: {value: 4, type: 'armor'}} as any})]});
    const cloak = Object.assign(new Item(), {id: 'cloak', name: 'Cloak of resistance +1', equipped: true, slot: 'shoulders',
      features: [new Feature({name: 'Cloak', adjustments: {savingThrowBonus: {value: 1, type: 'resistance'}} as any})]});
    char.inventory = [shirt, cloak];
    // a synthesist class feature that applies while fused
    char.classLevels[3].features = [new Feature({name: 'Shielded Meld', adjustments: {ac: {value: 2, type: 'shield', if: 'Fused'}} as any})];
    ls.setItem('character-' + char.id, char);
    saved.push(char.id);
    return char;
  };
  const claw = () => Object.assign(new MeleeAttack(), {name: 'Claw', type: 'natural', damage: '1d4', count: 2, toHitAbility: 'str', damageAbility: 'str'});

  beforeEach(() => {
    TestBed.configureTestingModule({});
    registry = TestBed.inject(CharacterRegistry);
    open = TestBed.inject(ApplyCharacterService);
  });
  afterEach(() => saved.splice(0).forEach(id => ls.removeItem('character-' + id)));

  const fusedSummoner = () => {
    const master = summoner();
    registry.openCharacter(master.id);
    const id = registry.createCompanion(master.id, 'eidolon', 'Crimson', ['Summoner'], 0, {goodSaves: ['fort', 'will'], synthesist: true})!;
    saved.push(id);
    const eidolon = registry.serviceFor(id)!;
    eidolon.update({abilityScores: {str: 16, dex: 12, con: 13, int: 7, wis: 10, cha: 11} as any, race: {name: 'Biped', subtype: 'Outsider', features: [
      new Feature({name: 'Biped', adjustments: {size: {value: 4, mode: 'set'}, 'speed.land': {value: 30, mode: 'set'}, ac: {value: 2, type: 'natural armor'}} as any}),
      new Feature({name: 'Claws', cost: 0, adjustments: {melee: [claw()]} as any}),
      new Feature({name: 'Resistance (Fire)', cost: 1, adjustments: {'energyResistance.fire': 5} as any}),
    ]}});
    TestBed.flushEffects();
    return {master, eidolon};
  };

  it('gives the summoner a Fused form of its eidolon, off until it fuses', () => {
    const {eidolon} = fusedSummoner();
    const fused = open.raw().conditions.find(c => c.form?.fusedWith === eidolon.raw().id)!;
    expect(fused.name).toBe('Fused');
    expect(fused.active).toBeFalse();
    expect(open.applied().bab).toBe(3);
  });

  it('takes the eidolon\'s body while fused, and keeps its own mind, saves and gear but not its armor', () => {
    const {eidolon} = fusedSummoner();
    open.setFeatureActive(open.raw().conditions.find(c => c.name === 'Fused')!, true);
    const applied = open.applied();
    const e = eidolon.applied();
    expect(applied.abilityScores.str).toBe(e.abilityScores.str);
    expect(applied.abilityScores.con).toBe(e.abilityScores.con);
    expect(applied.abilityScores.cha).toBe(16);
    expect(applied.bab).toBe(e.bab);
    expect(applied.tempHp).toBe(e.currentHp);
    expect(applied.melee.map(a => a.name)).toEqual(['Claw']);
    expect(applied.energyResistance.fire).toBe(5);
    // the chain shirt melded, the cloak works, the shielded meld applies
    const ac = (explainStat(open, 'ac') as any).lines.map((l: any) => l.source);
    expect(ac).not.toContain('Chain shirt');
    expect(ac).toContain('Shielded Meld');
    expect(applied.savingThrowBonus).toBe(1);
  });

  it('keeps up with its eidolon, and is gone when it is no synthesist\'s', () => {
    const {eidolon} = fusedSummoner();
    // the eidolon's sheet is where it is managed: its hurt shows in the summoner's temporary hp
    eidolon.update({damageTaken: 5} as any);
    registry.openCharacter(eidolon.raw().id);
    registry.openCharacter(saved[0]);
    open.setFeatureActive(open.raw().conditions.find(c => c.name === 'Fused')!, true);
    expect(open.applied().tempHp).toBe(registry.serviceFor(saved[1])!.applied().currentHp);
    registry.openCharacter(saved[1]);
    setCompanion(open, {synthesist: false});
    TestBed.flushEffects();
    registry.openCharacter(saved[0]);
    expect(open.raw().conditions.some(c => c.name === 'Fused')).toBeFalse();
  });
});
