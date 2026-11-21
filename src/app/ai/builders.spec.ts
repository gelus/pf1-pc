import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import example from '../example-character.json';
import { createFeature, createItem, describeAdjustments } from './builders';
import { rememberLookup } from './rules-lookup';
import { editItem } from './editors';

// building features and items on the example barbarian: checked by the validator, added as one undo step, and what
// they adjust is what the sheet then shows
describe('builders', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
  });

  it('adds a custom condition that applies at once and can be turned off', () => {
    rememberLookup('https://aonprd.com/SpellDisplay.aspx?ItemName=Heroism');
    const will = service.applied().saves.will;
    const result = createFeature(service, {
      list: 'conditions', name: 'Heroism', description: '+2 morale on attacks, saves and skill checks',
      adjustments: '{"attackRollBonus": {"value": 2, "type": "morale"}, "savingThrowBonus": {"value": 2, "type": "morale"}, "skillCheckBonus": {"value": 2, "type": "morale"}}',
      source_url: 'https://aonprd.com/SpellDisplay.aspx?ItemName=Heroism', based_on: 'looked up',
    });
    expect(result.done).toBe('added the condition Heroism: attackRollBonus +2 morale, savingThrowBonus +2 morale, skillCheckBonus +2 morale');
    const heroism = service.raw().conditions.find(c => c.name === 'Heroism')!;
    expect(heroism.active).toBeTrue();
    expect(heroism.description).toContain('Source: https://aonprd.com/SpellDisplay.aspx?ItemName=Heroism');
    expect(service.history.undoLabel()).toBe('add Heroism');
    service.undo();
    expect(service.raw().conditions.some(c => c.name === 'Heroism')).toBeFalse();
    expect(service.applied().saves.will).toBe(will);
  });

  it('refuses what the engine would get wrong, with the problems, and adds nothing', () => {
    const result = createFeature(service, {list: 'feats', name: 'Iron Will', adjustments: '{"saves.wil": 2}', based_on: 'own knowledge'});
    expect(result.error).toContain('nothing was added');
    expect(String(result['problems'])).toContain('saves.wil');
    expect(service.history.canUndo()).toBeFalse();
    expect(createFeature(service, {list: 'feats', name: 'Iron Will', adjustments: '{"saves.will": ', based_on: 'own knowledge'}).error).toContain('not valid JSON');
    expect(createFeature(service, {list: 'spells', name: 'x', adjustments: '{}'}).error).toContain('list is one of');
  });

  it('adds a feat with uses per day, once', () => {
    const result = createFeature(service, {
      list: 'feats', name: 'Stunning Fist', adjustments: '{}', description_only: 'its DC and effect are judged at the table', based_on: 'player description', uses_total: 1, uses_label: 'stunning attacks per day', uses_per: 'day',
    });
    expect(result.done).toBe('added the feat Stunning Fist');
    expect(service.raw().feats.find(f => f.name === 'Stunning Fist')!.charges).toEqual({total: 1, current: 1, label: 'stunning attacks per day', per: 'day'});
    expect(createFeature(service, {list: 'feats', name: 'stunning fist', adjustments: '{}', description_only: 'x', based_on: 'player description'}).error).toBe('the character already has the feat stunning fist');
  });

  it('adds a magic item that applies once equipped', () => {
    const bonus = Number(service.applied().savingThrowBonus) || 0;
    const result = createItem(service, {
      name: 'Cloak of Resistance +1', type: 'other', slot: 'shoulders', weight: 1, cost_gp: 1000, equip: true, based_on: 'own knowledge',
      features: '[{"name": "Cloak of Resistance +1", "adjustments": {"savingThrowBonus": {"value": 1, "type": "resistance"}}}]',
    });
    expect(result.done).toBe('added Cloak of Resistance +1 (equipped) (from memory, check it): savingThrowBonus +1 resistance');
    const cloak = service.raw().inventory.find(i => i.name === 'Cloak of Resistance +1')!;
    expect(cloak.slot).toBe('shoulders');
    expect(cloak.cost.gp).toBe(1000);
    expect(Number(service.applied().savingThrowBonus)).toBe(bonus + 1);
  });

  it('adds a weapon with its attack, unequipped when the hands are full', () => {
    const result = createItem(service, {
      name: 'Longsword', type: 'weapon', weight: 4, cost_gp: 15, proficiency: 'martial', equip: true, based_on: 'player description',
      features: JSON.stringify([{name: 'Longsword', adjustments: {melee: {name: 'Longsword', damage: '1d8', toHitAbility: 'str', damageAbility: 'str', crit: 19, critMultiplier: 2, damageType: ['S']}}}]),
    });
    // the example barbarian holds a greataxe in both hands
    expect(result.done).toBe('added Longsword: melee attack Longsword 1d8');
    expect(String(result['note'])).toContain('Great Axe would have to come off');
    expect(service.raw().inventory.find(i => i.name === 'Longsword')!.equipped).toBeFalse();
  });

  it('makes a weapon\'s attack from its stat block, and refuses one with no attack or a bonus to every attack', () => {
    const bow = {name: 'Composite Longbow (+2 Str)', type: 'weapon', cost_gp: 300, based_on: 'player description', features: '[]'};
    expect(createItem(service, bow).error).toContain('a weapon needs its attack');
    expect(createItem(service, {...bow, features: '[{"name": "Masterwork", "adjustments": {"ranged.*.toHitBonus": 1}}]', damage: '1d8'}).error)
      .toContain('adjusts every attack of the character');
    const result = createItem(service, {...bow, damage: '1d8', critical: 'x3', attack_kind: 'ranged', damage_type: 'P', range: 110});
    expect(result.done).toBe('added Composite Longbow (+2 Str): ranged attack Composite Longbow (+2 Str) 1d8');
    const attack = (service.raw().inventory.find(i => i.name === bow.name)!.features[0].adjustments as any).ranged[0];
    expect(attack).toEqual(jasmine.objectContaining({
      damage: '1d8', crit: 20, critMultiplier: 3, toHitAbility: 'dex', range: 110, damageType: ['P'], bow: 'composite', compositeRating: 2,
    }));
    // a dagger is a melee weapon that can be thrown: both attacks. a javelin is thrown only, a ranged attack
    const dagger = createItem(service, {name: 'Dagger', type: 'weapon', based_on: 'own knowledge', features: '[]', damage: '1d4', critical: '19-20/x2', attack_kind: 'melee and thrown', damage_type: 'P or S', range: 10});
    expect(dagger.done).toContain('melee attack Dagger 1d4');
    expect(dagger.done).toContain('ranged attack Dagger 1d4');
    const javelin = createItem(service, {name: 'Javelin', type: 'weapon', based_on: 'own knowledge', features: '[]', damage: '1d6', critical: 'x2', attack_kind: 'thrown', damage_type: 'P', range: 30});
    expect(javelin.done).toContain('ranged attack Javelin 1d6');
    expect(javelin.done).not.toContain('melee');
    // no attack_kind: a crossbow shoots
    expect(createItem(service, {name: 'Light crossbow', type: 'weapon', based_on: 'own knowledge', features: '[]', damage: '1d8', critical: '19-20/x2', range: 80}).done)
      .toBe('added Light crossbow (from memory, check it): ranged attack Light crossbow 1d8');
    expect((service.raw().inventory.find(i => i.name === 'Javelin')!.features[0].adjustments as any).ranged[0]).toEqual(jasmine.objectContaining({thrown: true, range: 30}));
  });

  it('refuses an item with a feature the engine would get wrong', () => {
    const result = createItem(service, {name: 'Odd Ring', type: 'other', slot: 'ring', features: '[{"adjustments": {"acc": 1}}]', based_on: 'player description'});
    expect(result.error).toContain('nothing was added');
    expect(service.raw().inventory.some(i => i.name === 'Odd Ring')).toBeFalse();
  });

  it('needs to know where it comes from, and a page looked up for "looked up"', () => {
    const feat = {list: 'feats', name: 'Dodge', adjustments: '{"ac": {"value": 1, "type": "dodge"}}'};
    expect(createFeature(service, feat).error).toContain('based_on is one of');
    expect(createFeature(service, {...feat, based_on: 'looked up', source_url: 'https://aonprd.com/FeatDisplay.aspx?ItemName=Dodge'}).error)
      .toContain('read it with look_up_rules first');
    expect(createFeature(service, {...feat, based_on: 'own knowledge'}).done).toBe('added the feat Dodge (from memory, check it): ac +1 dodge');
    expect(service.raw().feats.find(f => f.name === 'Dodge')!.description).toContain('from memory, not looked up');
  });

  it('describes adjustments in short', () => {
    expect(describeAdjustments({ac: -2, 'abilityScores.str': {value: 4, type: 'morale'}, maxDexBonus: {value: 3, mode: 'min'}}))
      .toBe('ac -2, abilityScores.str +4 morale, maxDexBonus +3 (min)');
  });

  it('refuses a feat whose prerequisites the character does not meet', () => {
    const selective = createFeature(service, {list: 'feats', name: 'Selective Channeling', adjustments: '{}', description_only: 'chosen at the table',
      prerequisites: 'Cha 99, channel energy class feature', based_on: 'own knowledge'}) as any;
    expect(selective.error).toContain('does not meet the prerequisites of Selective Channeling');
    expect(selective.error).toContain('Cha 99 (the character has');
    expect(selective.error).toContain('channel energy class feature (the character does not have it)');
    expect(createFeature(service, {list: 'feats', name: 'Iron Will', adjustments: '{"saves.will": 2}', prerequisites: 'none', based_on: 'own knowledge'}).done)
      .toContain('Iron Will');
  });

  it('keeps a weapon\'s attack when its features are edited without it', () => {
    createItem(service, {name: 'Scimitar', type: 'weapon', based_on: 'own knowledge', damage: '1d6', critical: '18-20/x2', attack_kind: 'melee'});
    const edited = editItem(service, {name: 'Scimitar', features: '[]'}) as any;
    expect(edited.note).toContain('its attack was kept');
    const scimitar = service.raw().inventory.find(i => i.name === 'Scimitar')!;
    expect((scimitar.features[0].adjustments as any).melee[0].damage).toBe('1d6');
  });

  it('prices ammunition by the bundle', () => {
    const bolts = createItem(service, {name: 'Crossbow bolts', type: 'other', quantity: 10, cost_gp: 1, based_on: 'own knowledge'}) as any;
    expect(bolts.priceCorrected).toContain('10 bolts for 1 gp');
    expect(service.raw().inventory.find(i => i.name === 'Crossbow bolts')!.cost.gp).toBe(0.1);
  });

  it('adds an item marked looked up that was not as built from memory', () => {
    const rope = createItem(service, {name: 'Silk rope', type: 'other', cost_gp: 10, based_on: 'looked up', source_url: 'https://example.com/rope'}) as any;
    expect(rope.done).toContain('from memory, check it');
    expect(rope.source).toContain('not looked up');
  });

  it('gives core armor its category and the speed it slows to, and a weapon\'s attack the weapon\'s name', () => {
    const scale = createItem(service, {name: 'Scale Mail', type: 'armor', armor_category: 'light', cost_gp: 50, based_on: 'own knowledge',
      features: JSON.stringify([{name: 'Scale Mail', adjustments: {ac: {value: 5, type: 'armor'}}}])}) as any;
    expect(scale.armorCorrected).toBe('Scale Mail is medium armor, not light');
    const armor = service.raw().inventory.find(i => i.name === 'Scale Mail') as any;
    expect([armor.armorCategory, armor.speed]).toEqual(['medium', [20, 15]]);
    createItem(service, {name: 'Greatsword', type: 'weapon', cost_gp: 50, based_on: 'own knowledge', damage: '2d6', critical: '19-20/x2',
      features: JSON.stringify([{name: 'Greatswordya', adjustments: {melee: [{name: 'Greatswordya', damage: '2d6'}]}}])});
    const sword = service.raw().inventory.find(i => i.name === 'Greatsword') as any;
    expect([sword.features[0].name, sword.features[0].adjustments.melee[0].name]).toEqual(['Greatsword', 'Greatsword']);
  });
});
