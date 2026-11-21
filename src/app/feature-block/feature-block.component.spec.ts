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

  it('sets how often the charges come back, or leaves it to their label', () => {
    component.hasCharges = true;
    component.feature.charges!.label = 'rages per day';
    fixture.detectChanges();
    expect(component.chargesPerFromLabel).toBe('day');
    expect(fixture.nativeElement.querySelector('.charges-per-select')).toBeTruthy();

    let emitted: Feature | undefined;
    component.featureChange.subscribe(feature => emitted = feature);
    component.setChargesPer('encounter');
    expect(component.feature.charges!.per).toBe('encounter');
    expect(emitted).toBe(component.feature);
    // the label still says what it would be without per
    expect(component.chargesPerFromLabel).toBe('day');

    component.setChargesPer('');
    expect('per' in component.feature.charges!).toBeFalse();
  });

  it('collapses to a line with its name and how many adjustments it has, and expands again', () => {
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('.feature-collapse-toggle') as HTMLButtonElement;
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Power Attack');
    expect((el.querySelector('.feature-body') as HTMLElement).hidden).toBeFalse();
    expect(el.querySelector('.feature-summary')).toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((el.querySelector('.feature-body') as HTMLElement).hidden).toBeTrue();
    expect(el.querySelector('.feature-summary')!.textContent).toContain('2 adjustments');
    // the feature is not changed by collapsing it
    expect(component.feature.adjustments).toEqual({ 'melee.*.toHitBonus': -1, 'melee.*.damageBonus': 2 });

    toggle.click();
    fixture.detectChanges();
    expect((el.querySelector('.feature-body') as HTMLElement).hidden).toBeFalse();
  });

  it('has no toggle of its own when something around it collapses it', () => {
    fixture.componentRef.setInput('collapsible', false);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.feature-collapse-toggle')).toBeNull();
    expect((el.querySelector('.feature-body') as HTMLElement).hidden).toBeFalse();
  });

  it('picks where the sheet lists the feature, automatic leaving it unset', () => {
    const select = fixture.nativeElement.querySelector('.feature-shown-in-select') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent!.trim())).toEqual(['Automatic', 'Special Attack', 'Defensive Abilities', 'Special Quality', 'Hidden']);
    component.setShownIn('defensiveAbilities');
    expect(component.feature.shownIn).toBe('defensiveAbilities');
    component.setShownIn('');
    expect(component.feature.shownIn).toBeUndefined();
  });
});
