import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ItemFormComponent } from './item-form.component';
import { Armor, Item, Shield, Weapon } from '../utils/item.class';

describe('ItemFormComponent', () => {
  let component: ItemFormComponent;
  let fixture: ComponentFixture<ItemFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ItemFormComponent);
    component = fixture.componentInstance;
    component.item = new Item();
    fixture.detectChanges();
  });

  it('should create and NOT expose game-time fields (quantity or equipped)', () => {
    expect(component).toBeTruthy();
    const html = fixture.nativeElement.innerHTML.toLowerCase();
    expect(fixture.nativeElement.querySelector('[name="quantity"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[name="equipped"]')).toBeNull();
    expect(html).not.toContain('quantity');
    expect(html).not.toContain('equipped');
  });

  it('should display Weapon-specific fields (proficiency, size, category, special) for Weapons', () => {
    component.item = new Weapon();
    component.itemKind = 'Weapon';
    component.syncFromItem();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.item-proficiency-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.item-size-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.item-category-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.item-special-input')).toBeTruthy();

    component.onSpecialChange('brace, trip');
    expect(component.item.special).toEqual(['brace', 'trip']);
  });

  it('should display Armor-specific fields (proficiency, size, speed) for Armor', () => {
    component.item = new Armor();
    component.itemKind = 'Armor';
    component.syncFromItem();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.item-proficiency-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.item-size-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.armor-speed30-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.armor-speed20-input')).toBeTruthy();

    component.speed30 = 20;
    component.speed20 = 15;
    component.onSpeedChange();
    expect(component.item.speed).toEqual([20, 15]);
  });

  it('should include EditFeatureArrayComponent for item features', () => {
    expect(fixture.nativeElement.querySelector('app-edit-feature-array')).toBeTruthy();
  });

  describe('armor limits', () => {
    const armorWith = (adjustments: any): Armor => {
      const armor = new Armor();
      armor.features[0].adjustments = adjustments;
      return armor;
    };
    const show = (armor: Armor) => {
      component.item = armor;
      component.itemKind = 'Armor';
      component.syncFromItem();
      fixture.detectChanges();
    };
    const type = async (selector: string, value: string) => {
      const input: HTMLInputElement = fixture.nativeElement.querySelector(selector);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    it('shows the max dex bonus and check penalty of armor', async () => {
      show(armorWith({ac: {value: 6, type: 'armor'}, maxDexBonus: {value: 3, mode: 'min'}, armorCheckPenalty: -4}));
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.armor-max-dex-input').value).toBe('3');
      expect(fixture.nativeElement.querySelector('.armor-check-penalty-input').value).toBe('-4');
    });

    it('does not show them for other items', () => {
      expect(fixture.nativeElement.querySelector('.armor-max-dex-input')).toBeNull();
      expect(fixture.nativeElement.querySelector('.armor-check-penalty-input')).toBeNull();
    });

    it('stores what is entered in the adjustments of the armor', async () => {
      const armor = armorWith({ac: {value: 6, type: 'armor'}});
      show(armor);
      const changes: Item[] = [];
      component.itemChange.subscribe((item: Item) => changes.push(item));
      await type('.armor-max-dex-input', '3');
      await type('.armor-check-penalty-input', '-4');
      expect(armor.features[0].adjustments['maxDexBonus']).toEqual({value: 3, mode: 'min'});
      expect(armor.features[0].adjustments['armorCheckPenalty']).toBe(-4);
      expect(armor.features[0].adjustments['ac']).toEqual({value: 6, type: 'armor'});
      expect(changes.length).toBe(2);
    });

    it('stores no max dex bonus for armor that does not limit it', async () => {
      const armor = armorWith({maxDexBonus: {value: 3, mode: 'min'}});
      show(armor);
      await type('.armor-max-dex-input', '');
      expect('maxDexBonus' in armor.features[0].adjustments).toBeFalse();
    });

    it('stores a max dex bonus of 0 as a cap of 0', async () => {
      const armor = armorWith({maxDexBonus: {value: 3, mode: 'min'}});
      show(armor);
      await type('.armor-max-dex-input', '0');
      expect(armor.features[0].adjustments['maxDexBonus']).toEqual({value: 0, mode: 'min'});
    });

    it('shows an empty max dex bonus for armor that does not limit it', async () => {
      show(armorWith({ac: {value: 1, type: 'armor'}}));
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.armor-max-dex-input').value).toBe('');
    });

    it('stores the armor bonus, spell failure and category of armor', async () => {
      const armor = armorWith({ac: {value: 6, type: 'armor'}});
      show(armor);
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.armor-ac-bonus-input').value).toBe('6');
      expect(fixture.nativeElement.querySelector('.shield-category-select')).toBeNull();
      await type('.armor-ac-bonus-input', '9');
      await type('.armor-spell-failure-input', '35');
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('.armor-category-select');
      select.value = 'heavy';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(armor.features[0].adjustments['ac']).toEqual({value: 9, type: 'armor'});
      expect(armor.features[0].adjustments['arcaneSpellFailureChance']).toBe(35);
      expect(armor.armorCategory).toBe('heavy');
    });

    it('edits a shield like armor, with a shield bonus, a category and no speed', async () => {
      const shield = new Shield();
      component.item = shield;
      component.itemKind = 'Shield';
      component.syncFromItem();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.armor-speed30-input')).toBeNull();
      expect(fixture.nativeElement.querySelector('.armor-category-select')).toBeNull();
      expect(fixture.nativeElement.querySelector('.item-category-input')).toBeNull();
      expect(fixture.nativeElement.querySelector('.armor-check-penalty-input').value).toBe('-1');
      await type('.armor-ac-bonus-input', '4');
      await type('.armor-max-dex-input', '2');
      await type('.armor-check-penalty-input', '-10');
      await type('.armor-spell-failure-input', '50');
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('.shield-category-select');
      select.value = 'tower';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(shield.features[0].adjustments).toEqual({
        ac: {value: 4, type: 'shield'}, maxDexBonus: {value: 2, mode: 'min'}, armorCheckPenalty: -10,
        arcaneSpellFailureChance: 50,
      });
      expect(shield.shieldCategory).toBe('tower');
    });

    it('stores the hands of a held item, empty for the default', async () => {
      const shield = new Shield();
      component.item = shield;
      component.syncFromItem();
      fixture.detectChanges();
      await type('.item-hands-input', '2');
      expect(shield.hands).toBe(2);
      await type('.item-hands-input', '');
      expect('hands' in shield).toBeFalse();
      expect(component.itemKind).toBe('Shield');
    });

    it('gives armor without a feature one to keep its limits in', async () => {
      const armor = new Armor();
      armor.features = [];
      show(armor);
      await type('.armor-max-dex-input', '2');
      expect(armor.features[0].adjustments['maxDexBonus']).toEqual({value: 2, mode: 'min'});
    });
  });
});
