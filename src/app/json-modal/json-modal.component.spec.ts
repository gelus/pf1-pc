import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JsonModalComponent } from './json-modal.component';
import { ClassLevel } from '../utils/classlevel.class';
import { Feature } from '../interfaces/character.interface';

describe('JsonModalComponent', () => {
  let component: JsonModalComponent;
  let fixture: ComponentFixture<JsonModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JsonModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JsonModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create without raw JSON textarea', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('should render ClassLevelFormComponent when opened with classLevels', () => {
    component.openModal('classLevels', [new ClassLevel({ name: 'Fighter', hitDice: 10, level: 1 })]);
    fixture.detectChanges();

    expect(component.mode).toBe('classLevels');
    expect(fixture.nativeElement.querySelector('app-class-level-form')).toBeTruthy();

    let emitted: any;
    component.updated.subscribe(val => (emitted = val));
    component.confirm();
    expect(emitted.classLevels[0].name).toBe('Fighter');
  });

  it('should render FeatureBlockComponent when opened with a single feat', () => {
    const feat = new Feature({ name: 'Dodge', adjustments: { ac: { value: 1, type: 'dodge' } } });
    component.openModal('feats', feat);
    fixture.detectChanges();

    expect(component.mode).toBe('feature');
    expect(fixture.nativeElement.querySelector('app-feature-block')).toBeTruthy();
  });
});
