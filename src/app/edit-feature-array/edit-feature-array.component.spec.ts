import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditFeatureArrayComponent } from './edit-feature-array.component';
import { Feature } from '../interfaces/character.interface';

describe('EditFeatureArrayComponent', () => {
  let component: EditFeatureArrayComponent;
  let fixture: ComponentFixture<EditFeatureArrayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditFeatureArrayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditFeatureArrayComponent);
    component = fixture.componentInstance;
    component.features = [
      new Feature({ name: 'Fast Movement', description: '+10ft land speed', adjustments: { 'speed.land': 10 } }),
    ];
    fixture.detectChanges();
  });

  it('should create and render existing features using FeatureBlockComponent', () => {
    expect(component).toBeTruthy();
    const blocks = fixture.nativeElement.querySelectorAll('app-feature-block');
    expect(blocks.length).toBe(1);
  });

  it('should allow adding and deleting features', () => {
    const addBtn = fixture.nativeElement.querySelector('.add-feature-btn') as HTMLButtonElement;
    addBtn.click();
    fixture.detectChanges();

    expect(component.features.length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('app-feature-block').length).toBe(2);

    const removeBtns = fixture.nativeElement.querySelectorAll('.remove-feature-btn');
    (removeBtns[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.features.length).toBe(1);
    expect(component.features[0].name).toBe('New Feature');
  });

  it('starts a single feature open, and collapses and expands it from its header', () => {
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('.feature-item-toggle') as HTMLButtonElement;
    const block = el.querySelector('app-feature-block') as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(block.hidden).toBeFalse();
    // the list's own header toggles it, the feature has no second toggle
    expect(block.querySelector('.feature-collapse-toggle')).toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(block.hidden).toBeTrue();
    expect(el.querySelector('.feature-item-summary')!.textContent).toContain('1 adjustment');

    toggle.click();
    fixture.detectChanges();
    expect(block.hidden).toBeFalse();
  });

  it('starts a list of several features collapsed, and a feature added to it open', () => {
    fixture.componentRef.setInput('features', [
      new Feature({ name: 'Rage', adjustments: {} }),
      new Feature({ name: 'Fast Movement', adjustments: { 'speed.land': 10 } }),
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const blocks = () => Array.from(el.querySelectorAll('app-feature-block')) as HTMLElement[];
    expect(blocks().map(b => b.hidden)).toEqual([true, true]);
    const summaries = Array.from(el.querySelectorAll('.feature-item-summary'), s => s.textContent!.trim());
    expect(summaries).toEqual(['0 adjustments', '1 adjustment']);

    (el.querySelector('.add-feature-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(blocks().map(b => b.hidden)).toEqual([true, true, false]);
  });
});
