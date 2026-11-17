import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddFeatureModalComponent } from './add-feature-modal.component';
import { Feature } from '../interfaces/character.interface';

describe('AddFeatureModalComponent', () => {
  let component: AddFeatureModalComponent;
  let fixture: ComponentFixture<AddFeatureModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddFeatureModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddFeatureModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and use FeatureBlockComponent instead of JSON textarea', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-feature-block')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('only shows a feature opened read only, with its note, and can not confirm it', async () => {
    const feat = new Feature({ name: 'Dying', description: 'A dying creature is unconscious', adjustments: { ac: 1 } });
    component.openModal('conditions', feat, 'from hit points: -2 hp');
    fixture.detectChanges();
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.readonly-note')?.textContent).toContain('from hit points: -2 hp');
    expect((element.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBeTrue();
    expect((element.querySelector('.feature-description-input') as HTMLInputElement).value).toBe('A dying creature is unconscious');
    const buttons = Array.from(element.querySelectorAll('.controls button')).map(b => b.textContent?.trim());
    expect(buttons).toEqual(['close']);
    // a copy is shown, the feature itself is left as it is
    expect(component.feature).not.toBe(feat);

    component.closeModal();
    component.openModal('feats', feat);
    fixture.detectChanges();
    expect(component.readonly).toBeFalse();
    expect(Array.from(element.querySelectorAll('.controls button')).map(b => b.textContent?.trim())).toEqual(['cancel', 'confirm']);
  });

  it('should open modal with feature and emit featureCreated on confirm', () => {
    const emitted: any[] = [];
    component.featureCreated.subscribe(val => emitted.push(val));

    const feat = new Feature({ name: 'Toughness', description: '+3 HP', adjustments: { hp: 3 } });
    component.openModal('feats', feat);
    fixture.detectChanges();

    expect(component.open).toBeTrue();
    expect(component.feature.name).toBe('Toughness');

    component.confirm();
    expect(emitted.length).toBe(1);
    expect(emitted[0].destination).toBe('feats');
    expect(emitted[0].feature.name).toBe('Toughness');
    expect(component.open).toBeFalse();
  });

  it('lists what is wrong with the adjustments of the feature being edited', () => {
    component.openModal('feats', new Feature({name: 'Weapon Focus', adjustments: {'abilityScore.str': 2, 'ac': 1}}));
    fixture.detectChanges();
    const items = [...fixture.nativeElement.querySelectorAll('.problems li')] as HTMLElement[];
    expect(items.length).toBe(1);
    expect(items[0].classList).toContain('error');
    expect(items[0].textContent).toContain('abilityScore.str');
    expect(items[0].textContent).toContain('did you mean "abilityScores"?');
  });

  it('lists nothing for a feature the engine can use', () => {
    component.openModal('feats', new Feature({name: 'Toughness', adjustments: {hp: 'max(3, {level})'}}));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.problems')).toBeNull();
  });
});
