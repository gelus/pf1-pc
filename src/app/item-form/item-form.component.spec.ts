import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ItemFormComponent } from './item-form.component';
import { Armor, Item, Weapon } from '../utils/item.class';

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
});
