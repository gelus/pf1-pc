import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';
import { craftQuote } from './crafting';
import { runAiTool } from '../ai/ai-tools';

// making a magic item: half its base price in materials, a day a 1,000 gp, Spellcraft DC 5 + its caster level
describe('crafting', () => {
  let service: ApplyCharacterService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('takes half the base price, a day a 1,000 gp, and DC 5 + the caster level', () => {
    const crafter = Object.assign(new Character(), {feats: [new Feature({name: 'Craft Wondrous Item', adjustments: {}})]});
    expect(craftQuote(crafter, {price: 4000, casterLevel: 5, feat: 'Craft Wondrous Item'})).toEqual({cost: 2000, time: '4 days', dc: 10,
      notes: ['failing the check by 5 or more makes a cursed item']});
    // a +1 longsword: its masterwork 300 gp paid in full, half of the 2,000 gp magic
    expect(craftQuote(crafter, {price: 2315, masterwork: 315, casterLevel: 3}).cost).toBe(1315);
    // a scroll of 250 gp or less in 2 hours; a missing requirement and the feat told
    const scroll = craftQuote(crafter, {price: 25, casterLevel: 1, brewedOrScribed: true, missing: 1, feat: 'Scribe Scroll'});
    expect(scroll.time).toBe('2 hours');
    expect(scroll.dc).toBe(11);
    expect(scroll.notes.join(' ')).toContain('does not have Scribe Scroll');
  });

  it('is the AI\'s craft_item: the item made and added, what it takes told, its gold to pay', async () => {
    service.initializeCharacter(new Character());
    const result = await runAiTool('craft_item', {name: 'Cloak of Resistance +1', type: 'other', slot: 'shoulders', cost_gp: 1000, based_on: 'own knowledge',
      features: '[{"name": "Cloak of Resistance +1", "adjustments": {"savingThrowBonus": {"value": 1, "type": "resistance"}}}]',
      feat: 'Craft Wondrous Item', caster_level: 5}, {character: service}) as any;
    expect(result.done).toContain('Cloak of Resistance');
    expect(result.craft).toEqual(jasmine.objectContaining({cost: 500, time: '1 day', dc: 10}));
    expect(result.pay).toEqual({gp: 500, what: 'crafting Cloak of Resistance +1'});
    expect(service.raw().inventory.map(i => i.name)).toEqual(['Cloak of Resistance +1']);
    expect(service.history.undoLabel()).toBe('craft Cloak of Resistance +1');
  });
});
