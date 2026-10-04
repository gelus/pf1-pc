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
});
