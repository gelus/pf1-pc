import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { Attack, attackMatches } from '../utils/attack.class';
import { attacksRule } from './attacks';
import { validateAdjustments } from './adjustment-schema';
import { mechanicsProblems } from '../ai/mechanics';
import { createItem } from '../ai/builders';
import { explainStat } from '../ai/character-reader';

// bonuses for one kind of weapon, a weapon group or one weapon: melee.@longsword.toHitBonus (Weapon Focus, Weapon
// Training, a bane weapon), each listed and stacked on the attacks it picks
describe('attack selectors', () => {
  let service: ApplyCharacterService;
  const attack = (fields: Partial<Attack> = {}): Attack =>
    Object.assign(new Attack(), {name: 'Longsword', damage: '1d8', toHitAbility: 'str', damageAbility: 'str'}, fields);
  const apply = (melee: Attack[], ranged: Attack[], ...features: Feature[]): Character => {
    const char = new Character();
    char.bab = 1;
    char.feats.push(new Feature({name: 'Weapons', adjustments: {melee, ...(ranged.length ? {ranged} : {})}}), ...features);
    service.ruleModules = [attacksRule];
    service.initializeCharacter(char);
    return service.applied();
  };
  const feat = (name: string, adjustments: any) => new Feature({name, adjustments});
  const origins = (a: Attack) => a.result!.toHit.parts.filter(p => !p.overwritten && p.value).map(p => p.origin);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('matches a weapon by its kind, its groups or the words of its name', () => {
    expect(attackMatches({name: '+1 Cold Iron Longsword'}, 'longsword')).toBeTrue();
    expect(attackMatches({name: 'Longsword'}, 'sword')).toBeFalse();
    expect(attackMatches({name: 'Grandfather\'s Blade', weapon: 'longsword'}, 'Longsword')).toBeTrue();
    expect(attackMatches({name: 'Falchion', groups: ['heavy blades']}, 'heavy blades')).toBeTrue();
    expect(attackMatches({name: 'Falchion', groups: ['heavy blades']}, 'heavy blade')).toBeTrue();
    expect(attackMatches({name: 'Shortsword'}, 'short sword')).toBeTrue();
    expect(attackMatches({name: 'Composite Longbow', groups: ['bows']}, 'bows')).toBeTrue();
    expect(attackMatches({name: 'Dagger'}, 'longsword')).toBeFalse();
  });

  it('gives a bonus to the attacks of one weapon only, in their tooltips', () => {
    const applied = apply([attack({name: 'Masterwork Longsword'}), attack({name: 'Dagger', damage: '1d4'})], [],
      feat('Weapon Focus (longsword)', {'melee.@longsword.toHitBonus': 1}));
    expect(applied.melee.map(a => a.toHitBonus)).toEqual([1, 0]);
    expect(origins(applied.melee[0])).toContain('Weapon Focus (longsword)');
    expect(origins(applied.melee[1])).not.toContain('Weapon Focus (longsword)');
  });

  it('reaches a weapon group, melee and ranged, and stacks its bonus types on each attack', () => {
    const applied = apply(
      [attack({name: 'Falchion', groups: ['heavy blades']}), attack({name: 'Club', groups: ['close']})],
      [attack({name: 'Longbow', groups: ['bows'], toHitAbility: 'dex', damageAbility: ''})],
      feat('Weapon Training (heavy blades)', {'melee.@heavy blades.toHitBonus': 1, 'melee.@heavy blades.damageBonus': 1}),
      feat('Bless', {'melee.*.toHitBonus': {value: 1, type: 'morale'}}),
      feat('Heroism', {'melee.@falchion.toHitBonus': {value: 2, type: 'morale'}}),
    );
    expect(applied.melee[0].damageBonus).toBe(1);
    expect(applied.melee[1].damageBonus).toBe(0);
    expect(applied.ranged[0].toHitBonus).toBe(0);
    // the two morale bonuses on the falchion are each listed, the selected one on the falchion's own path
    expect((service.adjustmentsMap['melee.0.toHitBonus'] || []).map(e => e.origin)).toEqual(['Weapon Training (heavy blades)', 'Heroism']);
    // and they do not stack: the falchion takes the +2 morale of Heroism, the club the +1 of Bless
    const counted = (a: Attack) => a.result!.toHit.parts.filter(p => !p.overwritten).map(p => p.origin);
    expect(counted(applied.melee[0])).toContain('Heroism');
    expect(counted(applied.melee[0])).not.toContain('Bless');
    expect(applied.melee[0].result!.toHit.parts.find(p => p.origin === 'Bless')!.overwritten).toBeTrue();
    expect(applied.melee[0].result!.toHit.total).toBe(1 + 1 + 2);
    expect(applied.melee[1].result!.toHit.total).toBe(1 + 1);
  });

  it('settles a morale bonus on every attack roll against one on this weapon', () => {
    const applied = apply([attack({name: 'Longsword'}), attack({name: 'Dagger'})], [],
      feat('Good Hope', {attackRollBonus: {value: 2, type: 'morale'}}),
      feat('Rally', {'melee.@longsword.toHitBonus': {value: 1, type: 'morale'}}));
    expect(applied.melee.map(a => a.result!.toHit.total)).toEqual([3, 3]);
  });

  it('sets and bounds the attacks it picks, and lists its variants on them', () => {
    const applied = apply([attack({name: 'Longsword', toHitBonus: 3}), attack({name: 'Dagger', toHitBonus: 3})], [],
      feat('Clumsy Grip', {'melee.@dagger.toHitBonus': {value: 0, mode: 'set'}}),
      feat('Bane', {'melee.@longsword.damageBonus[vs. undead]': 2}));
    expect(applied.melee.map(a => a.toHitBonus)).toEqual([3, 0]);
    expect((service.adjustmentsMap['melee.0.damageBonus'] || []).map(e => e.variant)).toEqual(['vs. undead']);
    expect(applied.melee[0].damageBonus).toBe(0);
  });

  it('is a path the validator takes, and the text check takes for "the selected weapon"', () => {
    expect(validateAdjustments({'melee.@longsword.toHitBonus': 1, 'ranged.@bows.damageBonus': 1})).toEqual([]);
    expect(validateAdjustments({'melee.longsword.toHitBonus': 1}).map(p => p.message).join(' ')).toContain('@longsword');
    const problems = mechanicsProblems([new Feature({name: 'Weapon Focus (longsword)',
      description: 'You gain a +1 bonus on all attack rolls you make using the selected weapon.',
      adjustments: {'melee.@longsword.toHitBonus': 1}})]);
    expect(problems.join(' ')).not.toContain('every attack');
  });

  it('is what create_item records of a weapon: its kind and groups', () => {
    service.initializeCharacter(new Character());
    createItem(service, {name: 'Grandfather\'s Blade', type: 'weapon', features: '[]', based_on: 'player description',
      damage: '1d8', critical: '19-20/x2', attack_kind: 'melee', handedness: 'one-handed', weapon: 'Longsword', weapon_groups: 'heavy blades'});
    const attack = (service.raw().inventory[0].features[0].adjustments as any).melee[0];
    expect(attack.weapon).toBe('longsword');
    expect(attack.groups).toEqual(['heavy blades']);
  });
});

// bonuses of one type that reach one number from different paths: the larger counts for that number only
describe('bonus types across the paths of a number', () => {
  let service: ApplyCharacterService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('gives a save the larger morale bonus of every save and its own, and the others theirs', () => {
    const char = new Character();
    char.feats.push(new Feature({name: 'Good Hope', adjustments: {savingThrowBonus: {value: 2, type: 'morale'}}}));
    char.feats.push(new Feature({name: 'Brave', adjustments: {'saves.will': {value: 1, type: 'morale'}, 'saves.fort': {value: 3, type: 'morale'}}}));
    service.initializeCharacter(char);
    const will = explainStat(service, 'saves.will') as any;
    const fort = explainStat(service, 'saves.fort') as any;
    const ref = explainStat(service, 'saves.ref') as any;
    expect(fort.total - ref.total).toBe(1);
    expect(will.total).toBe(ref.total);
    expect(will.lines.find((l: any) => l.source === 'Brave').notApplied).toContain('larger bonus');
    expect(fort.lines.find((l: any) => l.source === 'Good Hope').notApplied).toContain('larger bonus');
    expect(ref.lines.find((l: any) => l.source === 'Good Hope').notApplied).toBeUndefined();
  });

  it('settles a skill against every skill, and leaves untyped bonuses stacking', () => {
    const char = new Character();
    char.feats.push(new Feature({name: 'Guidance', adjustments: {skillCheckBonus: {value: 1, type: 'competence'}}}));
    char.feats.push(new Feature({name: 'Masterwork Tools', adjustments: {'skills.climb.value': {value: 2, type: 'competence'}}}));
    char.feats.push(new Feature({name: 'Skill Focus', adjustments: {'skills.climb.value': 3}}));
    service.initializeCharacter(char);
    const climb = explainStat(service, 'climb') as any;
    const acrobatics = explainStat(service, 'acrobatics') as any;
    // climb: +2 competence of the tools over the +1 of every skill, and the untyped +3
    expect(climb.total).toBe(2 + 3);
    expect(acrobatics.total).toBe(1);
  });
});
