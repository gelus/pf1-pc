import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpellModalComponent } from './spell-modal.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { CLASS_PRESETS, classLevelFromPreset } from '../rules/class-presets';

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
    expect(fixture.nativeElement.querySelector('textarea:not(.description-textarea)')).toBeNull();
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

  it('shows the DC of a class caster spell and prepares it, in the school slot too', () => {
    const char = new Character();
    char.abilityScores.int = 11;
    char.classLevels = [classLevelFromPreset(CLASS_PRESETS.find(p => p.name === 'Wizard')!, 1, true)];
    char.spells = {wizard: {name: '', ability: '', casterLevel: 0, concentration: 0, school: 'evocation', spells: [
      undefined as any,
      {perDay: {total: 0, current: 0}, spells: [{
        name: 'Burning Hands', school: 'evocation', castingTime: '1 standard action', components: ['V', 'S'],
        range: '15 ft.', target: 'cone', duration: 'instantaneous', savingThrow: 'Reflex half',
        spellResistance: true, description: 'Flames.',
      }]},
    ]}};
    service.initializeCharacter(char);
    const wizard = service.applied().spells['wizard'];
    component.openSpell('spells', 'wizard', 1, wizard, wizard.spells[1].spells[0]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.spell-dc').textContent).toContain('11');
    (fixture.nativeElement.querySelector('.prepare') as HTMLElement).click();
    (fixture.nativeElement.querySelector('.prepare-extra') as HTMLElement).click();
    (fixture.nativeElement.querySelector('.prepare') as HTMLElement).click();
    fixture.detectChanges();
    expect(service.applied().spells['wizard'].spells[1].prepared!.length).toBe(2);
    expect(fixture.nativeElement.querySelector('.prepare-error').textContent).toContain('no free slot');
    expect(fixture.nativeElement.querySelector('.prepared-count').textContent).toContain('2');
  });
});
