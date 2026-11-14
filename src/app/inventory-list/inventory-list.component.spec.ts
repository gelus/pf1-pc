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
          features: [feature('Full Plate', {maxDexBonus: 1, armorCheckPenalty: -6})]} as any));
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
});
