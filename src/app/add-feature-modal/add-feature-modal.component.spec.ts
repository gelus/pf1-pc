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
});
