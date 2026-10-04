import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpellModalComponent } from './spell-modal.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';

describe('SpellModalComponent', () => {
  let component: SpellModalComponent;
  let fixture: ComponentFixture<SpellModalComponent>;
  let service: ApplyCharacterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpellModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SpellModalComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(new Character());
    fixture.detectChanges();
  });

  it('should create and use SpellFormComponent in unified edit-in-place mode', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-spell-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('should save a new spell with adjustments via SpellFormComponent', () => {
    component.openNew('spells', 'wizard', 1);
    component.caster.name = 'Wizard';
    component.caster.ability = 'int';
    component.perDay = { current: 2, total: 2, label: '1st level' };
    component.spell.name = 'Mage Armor';
    component.spell.school = 'Conjuration';
    component.spell.adjustments = { ac: { value: 4, type: 'armor' } };
    fixture.detectChanges();

    component.save();
    expect(service.applied().spells['wizard'].spells[1].spells[0].name).toBe('Mage Armor');
  });
});
