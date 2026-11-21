import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import example from '../example-character.json';
import { explainStat } from './character-reader';
import { editFeature, editItem, rawFeatures, removeFeature, removeItem } from './editors';

// changing and removing what the example barbarian has: its feats, its class features and the features of its items
describe('editors', () => {
  let service: ApplyCharacterService;
  const hat = () => service.raw().inventory.find(i => i.name === 'A Sick Hat')!;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
  });

  it('finds every feature of the raw character with where it is', () => {
    const found = rawFeatures(service).map(f => `${f.feature.name} (${f.where})`);
    expect(found).toContain('A New Feature (item (A Sick Hat))');
    expect(found).toContain('Rage (given by Rage)');
    expect(found).toContain('Bloody Vengeance (Combat) (feats)');
  });

  it('names an item\'s unnamed feature after the item, and says the armor check penalty is one', () => {
    const lines = (explainStat(service, 'acrobatics') as any).lines.map((l: any) => [l.value, l.source]);
    expect(lines).toContain([-4, 'armor check penalty from A Sick Hat']);
    expect(hat().features[0].name).toBe('A New Feature');
  });

  it('renames an item\'s feature, as one undo step', () => {
    const result = editFeature(service, {name: 'A New Feature', item: 'A Sick Hat', new_name: 'Sick Hat Brim'});
    expect(result.done).toBe('changed Sick Hat Brim (item (A Sick Hat)): renamed to Sick Hat Brim');
    expect(hat().features[0].name).toBe('Sick Hat Brim');
    expect((explainStat(service, 'acrobatics') as any).lines.map((l: any) => l.source)).toContain('armor check penalty from Sick Hat Brim');
    expect(service.history.undoLabel()).toBe('edit A New Feature');
    service.undo();
    expect(hat().features[0].name).toBe('A New Feature');
  });

  it('replaces a feature\'s adjustments once they check out, and its uses', () => {
    const rage = () => rawFeatures(service).find(f => f.feature.name === 'Rage' && f.where === 'given by Rage')!.feature;
    expect(editFeature(service, {name: 'Rage', adjustments: '{"abilityScores.strr": 4}'}).error).toContain('could be more than one');
    const result = editFeature(service, {name: 'Bloody Vengeance (Combat)', adjustments: '{"abilityScores.strr": 4}'});
    expect(result.error).toContain('nothing was changed');
    expect(editFeature(service, {name: 'Bloody Vengeance (Combat)', uses_total: 2, uses_label: 'per day', uses_per: 'day'}).done)
      .toBe('changed Bloody Vengeance (Combat) (feats): 2 per day');
    expect(service.raw().feats.find(f => f.name === 'Bloody Vengeance (Combat)')!.charges).toEqual(jasmine.objectContaining({total: 2, current: 2, per: 'day'}));
    expect(rage().charges!.total).toBe(4);
  });

  it('removes a feature, but not one another feature gives', () => {
    expect(removeFeature(service, {name: 'Bloody Vengeance (Combat)'}).done).toBe('removed Bloody Vengeance (Combat) (feats)');
    expect(service.raw().feats.some(f => f.name === 'Bloody Vengeance (Combat)')).toBeFalse();
    const given = rawFeatures(service).find(f => f.where.startsWith('given by'))!;
    expect(removeFeature(service, {name: given.feature.name, item: ''}).error ?? '').toMatch(/given by|more than one/);
  });

  it('edits and removes an item', () => {
    expect(editItem(service, {name: 'a sick hat', new_name: 'A Very Sick Hat', quantity: 2, cost_gp: 5}).done)
      .toBe('changed A Very Sick Hat: renamed to A Very Sick Hat, quantity 2, cost 5 gp');
    expect(service.raw().inventory.find(i => i.name === 'A Very Sick Hat')!.cost.gp).toBe(5);
    expect(editItem(service, {name: 'A Very Sick Hat'}).error).toContain('say what to change');
    expect(removeItem(service, {name: 'A Very Sick Hat'}).done).toBe('removed A Very Sick Hat from the inventory');
    expect(removeItem(service, {name: 'Nothing'}).error).toBe('the character has no item "Nothing"');
  });
});
