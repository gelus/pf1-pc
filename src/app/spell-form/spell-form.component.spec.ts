import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpellFormComponent } from './spell-form.component';

describe('SpellFormComponent', () => {
  let component: SpellFormComponent;
  let fixture: ComponentFixture<SpellFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpellFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SpellFormComponent);
    component = fixture.componentInstance;
    component.spell = {
      name: 'Longstrider',
      school: 'Transmutation',
      subSchool: '',
      descriptors: ['movement'],
      castingTime: '1 standard action',
      components: ['V', 'S', 'M'],
      range: 'Personal',
      target: 'You',
      duration: '1 hour/level',
      savingThrow: 'None',
      spellResistance: false,
      description: '+10ft enhancement bonus to speed.',
      adjustments: { 'speed.land': 10 },
    };
    component.syncFromSpell();
    fixture.detectChanges();
  });

  it('should create and bind spell fields in compact inline layout', () => {
    expect(component).toBeTruthy();
    expect(component.componentsText).toBe('V, S, M');
    expect(component.descriptorsText).toBe('movement');
    expect(fixture.nativeElement.querySelector('app-adjustment-block')).toBeTruthy();
  });

  it('should parse comma-separated components and descriptors into arrays', () => {
    component.onComponentsChange('V, S, F');
    expect(component.spell.components).toEqual(['V', 'S', 'F']);

    component.onDescriptorsChange('fire, light');
    expect(component.spell.descriptors).toEqual(['fire', 'light']);

    component.onDescriptorsChange('');
    expect(component.spell.descriptors).toBeUndefined();
  });
});
