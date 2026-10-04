import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClassLevelFormComponent } from './class-level-form.component';
import { ClassLevel } from '../utils/classlevel.class';
import { Feature } from '../interfaces/character.interface';

describe('ClassLevelFormComponent', () => {
  let component: ClassLevelFormComponent;
  let fixture: ComponentFixture<ClassLevelFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassLevelFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ClassLevelFormComponent);
    component = fixture.componentInstance;
    component.classLevels = [
      new ClassLevel({
        name: 'Barbarian',
        level: 1,
        hitDice: 12,
        rolledHp: 0,
        skillRanks: 4,
        startingWealth: 105,
        classSkills: ['acrobatics', 'climb'],
        features: [new Feature({ name: 'Rage', adjustments: { 'abilityScores.str': 4 } })],
      }),
    ];
    fixture.detectChanges();
  });

  it('should create and render all ClassLevel fields and EditFeatureArrayComponent', () => {
    expect(component).toBeTruthy();
    expect((fixture.nativeElement.querySelector('.class-name-input') as HTMLInputElement).value).toBe('Barbarian');
    expect(fixture.nativeElement.querySelector('.class-level-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-hitdice-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-rolledhp-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-skillranks-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-wealth-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-skills-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-edit-feature-array')).toBeTruthy();
  });

  it('should allow adding and removing class levels and toggling class skills', () => {
    component.addClassLevel();
    fixture.detectChanges();
    expect(component.classLevels.length).toBe(2);
    expect(component.classLevels[1].level).toBe(2);

    component.toggleClassSkill(component.classLevels[0], 'perception', true);
    expect(component.classLevels[0].classSkills).toContain('perception');

    component.toggleClassSkill(component.classLevels[0], 'climb', false);
    expect(component.classLevels[0].classSkills).not.toContain('climb');

    component.removeClassLevel(1);
    expect(component.classLevels.length).toBe(1);
  });
});
