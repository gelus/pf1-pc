import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryListComponent } from './inventory-list.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Item } from '../utils/item.class';
import { Feature } from '../interfaces/character.interface';

describe('InventoryListComponent', () => {
  let component: InventoryListComponent;
  let fixture: ComponentFixture<InventoryListComponent>;
  let service: ApplyCharacterService;

  const item = (name: string, weight: number, extra: Partial<Item> = {}): Item =>
    Object.assign(new Item(), {id: name, name, weight, ...extra});

  const show = (mutate: (char: Character) => void = () => {}) => {
    const char = new Character();
    mutate(char);
    service.initializeCharacter(char);
    fixture.detectChanges();
  };

  const text = (selector: string): string =>
    (fixture.nativeElement.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryListComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(ApplyCharacterService);
    // the list hands changes up to the sheet, which updates the character with them
    component.inventoryChange.subscribe(change => service.update(change));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows what the character carries against its carrying capacity and its load', () => {
    show(char => char.inventory.push(item('Pack', 40), item('Arrows', 0.15, {quantity: 20})));
    expect(text('.encumbrance')).toBe('Carrying 43 / 100 lbs. (Medium load)');
    expect(fixture.nativeElement.querySelector('.carrying-capacity').title)
      .toBe('light up to 33 lbs., medium up to 66 lbs., heavy up to 100 lbs.');
    const weights = Array.from(fixture.nativeElement.querySelectorAll('.item-weight'), (el: any) => el.textContent.trim());
    expect(weights).toEqual(['40', '3']);
  });

  it('labels a light load and an overloaded character', () => {
    show();
    expect(text('.load')).toBe('(Light load)');
    show(char => char.inventory.push(item('Boulder', 500)));
    expect(text('.load')).toBe('(Overloaded)');
  });

  it('stops weighing an item that is left behind, and takes it off', () => {
    show(char => char.inventory.push(item('Shield', 15, {equipped: true, slot: 'held'}), item('Pack', 30)));
    const shield = service.raw().inventory[0];
    component.carryItem(shield, false);
    fixture.detectChanges();
    expect(shield.equipped).toBeFalse();
    expect(service.applied().carriedWeight).toBe(30);
    expect(text('.encumbrance')).toBe('Carrying 30 / 100 lbs. (Light load)');
  });

  it('carries an item that gets equipped', () => {
    show(char => char.inventory.push(item('Shield', 15, {carried: false, slot: 'held'})));
    const shield = service.raw().inventory[0];
    shield.equipped = true;
    component.equipItem(shield);
    expect(shield.carried).toBeTrue();
    expect(service.applied().carriedWeight).toBe(15);
  });

  describe('slots and hands', () => {
    const equip = (index: number) => {
      const it = service.raw().inventory[index];
      it.equipped = true;
      component.equipItem(it);
      fixture.detectChanges();
      return service.raw().inventory.map(i => i.equipped);
    };

    it('takes a two-handed weapon in both hands, taking off what was held, and says so', () => {
      show(char => char.inventory.push(
        item('Longsword', 4, {equipped: true, slot: 'held'}),
        item('Heavy Shield', 15, {equipped: true, slot: 'held', type: 'shield'}),
        item('Greatsword', 8, {slot: 'held', hands: 2}),
      ));
      expect(equip(2)).toEqual([false, false, true]);
      expect(text('.equip-notice')).toContain('Unequipped Longsword, Heavy Shield to free both hands for Greatsword.');
    });

    it('takes a shield in one hand, a buckler in none', () => {
      show(char => char.inventory.push(
        item('Greatsword', 8, {equipped: true, slot: 'held', hands: 2}),
        item('Buckler', 5, {slot: 'held', type: 'shield', shieldCategory: 'buckler'} as any),
        item('Heavy Shield', 15, {slot: 'held', type: 'shield', shieldCategory: 'heavy'} as any),
      ));
      expect(equip(1)).toEqual([true, true, false]);
      expect(fixture.nativeElement.querySelector('.equip-notice')).toBeNull();
      expect(equip(2)).toEqual([false, true, true]);
      expect(text('.equip-notice')).toContain('to free a hand for Heavy Shield');
    });

    it('fits two rings and one item in any other slot', () => {
      show(char => char.inventory.push(
        item('Ring A', 0, {equipped: true, slot: 'ring'}),
        item('Ring B', 0, {equipped: true, slot: 'ring'}),
        item('Ring C', 0, {slot: 'ring'}),
        item('Cloak A', 1, {equipped: true, slot: 'shoulders'}),
        item('Cloak B', 1, {slot: 'shoulders'}),
      ));
      expect(equip(2)).toEqual([false, true, true, true, false]);
      expect(text('.equip-notice')).toContain('Unequipped Ring A to free the ring slot for Ring C.');
      expect(equip(4)).toEqual([false, true, true, false, true]);
    });
  });

  describe('load guide', () => {
    const feature = (name: string, adjustments: any) => new Feature({name, active: true, adjustments});
    const hoverLoad = (): Element => {
      fixture.nativeElement.querySelector('.load-info').dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('.load-guide');
    };
    const lines = (el: Element, selector: string): string[] =>
      Array.from(el.querySelectorAll(selector), (li: any) => li.textContent.replace(/\s+/g, ' ').trim());
    const withSpeed = (char: Character) => char.race.features.push(feature('racial-stats', {'speed.land': 30}));

    it('is shown while the load is hovered', () => {
      show();
      expect(fixture.nativeElement.querySelector('.load-guide')).toBeNull();
      expect(hoverLoad()).toBeTruthy();
      fixture.nativeElement.querySelector('.load-info').dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.load-guide')).toBeNull();
    });

    it('names the current load and the weights it spans for the character', () => {
      show(char => char.inventory.push(item('Pack', 40)));
      hoverLoad();
      expect(text('.load-guide > b')).toBe('Medium load');
      expect(text('.load-range')).toBe('more than 33, up to 66 lbs.');
      show();
      expect(text('.load-range')).toBe('up to 33 lbs.');
      show(char => char.inventory.push(item('Boulder', 150)));
      expect(text('.load-range')).toBe('more than 100 lbs.');
    });

    it('says a light load has no effects', () => {
      show();
      expect(lines(hoverLoad(), 'li')).toEqual(['No effects']);
    });

    it('lists every effect of a load on a character without armor', () => {
      show(char => {
        withSpeed(char);
        char.inventory.push(item('Pack', 40));
      });
      expect(lines(hoverLoad(), 'li')).toEqual([
        'Dex bonus to AC capped at +3',
        '-3 check penalty on Str and Dex based skills',
        'Speed reduced to 20 ft.',
        'Runs at x4 speed',
        'Counts as medium armor for abilities restricted by armor',
      ]);
    });

    it('leaves out what the armor already does as badly', () => {
      show(char => {
        withSpeed(char);
        char.inventory.push(item('Full Plate', 50, {equipped: true, slot: 'armor', speed: [20, 15],
          features: [feature('Full Plate', {maxDexBonus: {value: 1, mode: 'min'}, armorCheckPenalty: -6})]} as any));
      });
      expect(lines(hoverLoad(), 'li')).toEqual([
        'Runs at x4 speed',
        'Counts as medium armor for abilities restricted by armor',
      ]);
    });

    it('lists the heavy load effects of an overloaded character', () => {
      show(char => {
        withSpeed(char);
        char.inventory.push(item('Boulder', 150));
      });
      expect(lines(hoverLoad(), 'li')).toEqual([
        'Dex bonus to AC capped at +1',
        '-6 check penalty on Str and Dex based skills',
        'Speed reduced to 20 ft.',
        'Runs at x3 speed',
        'Counts as heavy armor for abilities restricted by armor',
        'Treated as a heavy load by the sheet',
      ]);
    });
  });

  describe('armor limits', () => {
    const limits = (mutate: (char: Character) => void) => {
      show(mutate);
      return {maxDex: text('.armor-limits .max-dex'), checkPenalty: text('.armor-limits .check-penalty')};
    };
    const feature = (name: string, adjustments: any) => new Feature({name, active: true, adjustments});

    it('shows the max dex bonus and check penalty the character ends up with', () => {
      expect(limits(char => char.feats.push(feature('Breastplate', {maxDexBonus: {value: 3, mode: 'min'}, armorCheckPenalty: -4}))))
        .toEqual({maxDex: '+3', checkPenalty: '-4'});
    });

    it('shows a max dex bonus of +0 for armor that caps it at 0', () => {
      expect(limits(char => char.feats.push(feature('Hellknight Plate', {maxDexBonus: {value: 0, mode: 'min'}, armorCheckPenalty: -5}))))
        .toEqual({maxDex: '+0', checkPenalty: '-5'});
    });

    it('shows a dash when nothing limits the dex bonus', () => {
      expect(limits(() => {})).toEqual({maxDex: '—', checkPenalty: '0'});
    });

    it('follows what is equipped, armor and shield together', () => {
      const result = limits(char => char.inventory.push(
        item('Full Plate', 50, {equipped: true, slot: 'armor',
          features: [feature('Full Plate', {maxDexBonus: {value: 1, mode: 'min'}, armorCheckPenalty: -6})]}),
        item('Heavy Shield', 15, {equipped: true, slot: 'held', type: 'shield',
          features: [feature('Heavy Shield', {armorCheckPenalty: -2})]}),
        item('Spare Shield', 15, {equipped: false, slot: 'held', type: 'shield',
          features: [feature('Spare Shield', {armorCheckPenalty: -9})]}),
      ));
      expect(result).toEqual({maxDex: '+1', checkPenalty: '-8'});
    });
  });

  describe('search', () => {
    const names = (): string[] =>
      Array.from(fixture.nativeElement.querySelectorAll('.inventoryList:not(.pf-row--head) .name span') as NodeListOf<HTMLElement>,
        name => name.textContent!.trim());
    const search = (filter: string) => {
      fixture.componentRef.setInput('filter', filter);
      fixture.detectChanges();
    };

    beforeEach(() => show(char => char.inventory.push(
      item('Longsword', 4, {slot: 'held'}), item('Chain Shirt', 25, {slot: 'armor'}), item('Rope', 10, {slot: 'slotless'}))));

    it('shows only the items whose name or slot has it', () => {
      search('long');
      expect(names()).toEqual(['Longsword']);
      search('ARMOR');
      expect(names()).toEqual(['Chain Shirt']);
    });

    it('says when nothing matches, and shows every item again without a search', () => {
      search('zzz');
      expect(names()).toEqual([]);
      expect(text('.items-empty')).toBe('No items match “zzz”.');
      search('');
      expect(names()).toEqual(['Longsword', 'Chain Shirt', 'Rope']);
    });
  });
});
