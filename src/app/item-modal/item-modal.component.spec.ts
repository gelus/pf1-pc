import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ItemModalComponent } from './item-modal.component';
import { Armor, Shield, Weapon } from '../utils/item.class';

describe('ItemModalComponent', () => {
  let component: ItemModalComponent;
  let fixture: ComponentFixture<ItemModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ItemModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render ItemFormComponent instead of JSON textarea', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-item-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('should switch item types and emit updated item on confirm', () => {
    const emitted: any[] = [];
    component.itemUpdate.subscribe(item => emitted.push(item));

    component.openModal();
    component.typeChange('Weapon');
    fixture.detectChanges();

    expect(component.itemKind).toBe('Weapon');
    component.item.name = 'Longsword';
    component.confirm();

    expect(emitted.length).toBe(1);
    expect(emitted[0].name).toBe('Longsword');
    expect(component.open).toBeFalse();
  });

  it('makes a shield and opens a saved shield as one', () => {
    component.openModal('Shield');
    expect(component.itemKind).toBe('Shield');
    expect(component.item.type).toBe('shield');
    expect(component.item.slot).toBe('held');
    expect((component.item as any).shieldCategory).toBe('light');
    expect(component.item.features[0].adjustments['ac']).toEqual({value: 1, type: 'shield'});
    component.closeModal();

    component.openModal({...new Shield(), shieldCategory: 'tower'} as Shield);
    expect(component.itemKind).toBe('Shield');
    component.openModal(new Armor());
    expect(component.itemKind).toBe('Armor');
  });
});
