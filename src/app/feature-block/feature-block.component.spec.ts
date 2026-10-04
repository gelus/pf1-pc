import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeatureBlockComponent } from './feature-block.component';
import { Feature } from '../interfaces/character.interface';

describe('FeatureBlockComponent', () => {
  let component: FeatureBlockComponent;
  let fixture: ComponentFixture<FeatureBlockComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureBlockComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureBlockComponent);
    component = fixture.componentInstance;
    component.feature = new Feature({
      name: 'Power Attack',
      description: 'Trade attack bonus for damage',
      adjustments: { 'melee.*.toHitBonus': -1, 'melee.*.damageBonus': 2 },
    });
    fixture.detectChanges();
  });

  it('should create and render feature fields and adjustment block', () => {
    expect(component).toBeTruthy();
    const nameInput = fixture.nativeElement.querySelector('.feature-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Power Attack');
    expect(fixture.nativeElement.querySelector('app-adjustment-block')).toBeTruthy();
  });

  it('should toggle active boolean and charges object', () => {
    expect(component.hasActiveToggle).toBeFalse();
    component.hasActiveToggle = true;
    fixture.detectChanges();
    expect(component.feature.active).toBeTrue();
    expect(fixture.nativeElement.querySelector('.feature-active-input')).toBeTruthy();

    component.hasActiveToggle = false;
    fixture.detectChanges();
    expect(component.feature.active).toBeUndefined();

    expect(component.hasCharges).toBeFalse();
    component.hasCharges = true;
    fixture.detectChanges();
    expect(component.feature.charges).toEqual({ current: 1, total: 1, label: '' });
    expect(fixture.nativeElement.querySelector('.charges-current-input')).toBeTruthy();

    component.feature.charges!.total = 5;
    component.feature.charges!.current = 4;
    component.feature.charges!.label = 'rounds/day';
    component.emitChange();
    expect(component.feature.charges).toEqual({ current: 4, total: 5, label: 'rounds/day' });

    component.hasCharges = false;
    fixture.detectChanges();
    expect(component.feature.charges).toBeUndefined();
  });
});
