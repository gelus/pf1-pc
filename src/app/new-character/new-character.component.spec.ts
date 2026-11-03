import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NewCharacterComponent } from './new-character.component';
import { Feature } from '../interfaces/character.interface';
import { KNOWLEDGE_SPECIALTIES } from '../utils/skilllist.class';

describe('NewCharacterComponent', () => {
  let component: NewCharacterComponent;
  let fixture: ComponentFixture<NewCharacterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewCharacterComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewCharacterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('configures default Barbarian classSkills for knowledge (nature) only and all craft specialties', () => {
    const applied = component.character.applied();
    for (const spec of KNOWLEDGE_SPECIALTIES) {
      expect(applied.skills['knowledge'].subSkills![spec].classSkill).toBe(spec === 'nature');
    }
    expect(Object.keys(applied.skills['craft'].subSkills!)).toEqual([]);

    component.character.raw().feats.push(
      new Feature({
        name: 'Weaponsmith',
        active: true,
        adjustments: { 'skills.craft.subSkills.weapons.value': 0 },
      })
    );
    component.character.update();

    const updated = component.character.applied();
    expect(updated.skills['craft'].subSkills!['weapons']).toBeDefined();
    expect(updated.skills['craft'].subSkills!['weapons'].classSkill).toBeTrue();
  });
});
